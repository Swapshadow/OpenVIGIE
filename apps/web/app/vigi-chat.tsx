'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { vendorCatalog } from './asset-catalog';
import type { InventoryAsset } from './vulnerability-types';
import type { Cadence } from './bulletin-data';

const INVENTORY_STORAGE_KEY = 'openvigie.inventory.v1';

type ChatRole = 'user' | 'assistant';

type ChatSource = { name: string; url: string };

type CorrelatedAsset = {
  label: string;
  vendor: string;
  product: string;
  version: string;
  kev: boolean;
  verified: boolean;
  cves: string[];
  kevCves: string[];
  articles: { title: string; url: string; source: string; cves: string[] }[];
};

type AssetCorrelation = {
  totalDeclared: number;
  affected: CorrelatedAsset[];
  notAffectedCount: number;
  notAffectedSample: string[];
  unverifiedCount: number;
  unverifiedSample: string[];
};

type ChatMessage = {
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
  usedContext?: { bulletin: boolean; cadence: Cadence | null; assets: number; assetsAffected?: number };
  assetCorrelation?: AssetCorrelation;
  streaming?: boolean;
  error?: boolean;
  /** Front-end-only greeting shown once when the panel opens. Never sent to the
   *  backend — otherwise the model receives it as a prior assistant turn and
   *  starts echoing it back on every reply. */
  intro?: boolean;
};

type ResolvedAsset = {
  label: string;
  vendor: string;
  product: string;
  version: string;
  exposure: string;
  part: 'a' | 'o' | 'h';
  cpeVendor: string;
  cpeProduct: string;
};

type NdjsonEvent =
  | { type: 'meta'; model: string; usedContext: ChatMessage['usedContext']; sources: ChatSource[]; assetCorrelation: AssetCorrelation | null }
  | { type: 'token'; text: string }
  | { type: 'done'; cached?: boolean }
  | { type: 'error'; message: string };

const SUGGESTIONS = [
  'Quelles sont les vulnérabilités majeures du bulletin du jour ?',
  'Un de mes équipements est-il affecté ?',
  'Résume les menaces à surveiller cette semaine.',
];

const WELCOME =
  "Bonjour, je suis Vigi, l'assistant d'OpenVigie. Je réponds à partir du bulletin " +
  'attribué et je vérifie votre parc contre les CVE et le catalogue CISA KEV par des ' +
  'règles factuelles — je n’invente rien et je cite mes sources.';

function resolveInventory(): ResolvedAsset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InventoryAsset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 60).map((asset) => {
      const vendor = vendorCatalog.find((entry) => entry.id === asset.vendorId);
      const product = vendor?.products.find((entry) => entry.id === asset.productId);
      return {
        label: (asset.label ?? '').slice(0, 80),
        vendor: vendor?.name ?? asset.vendorId ?? '',
        product: product?.name ?? asset.productId ?? '',
        version: (asset.version ?? '').slice(0, 80),
        exposure: (asset.exposure ?? '').slice(0, 80),
        // Lets the backend rebuild the exact cache_key "Mon parc" uses, so Vigi
        // reads the same verified NVD/CISA KEV snapshot — never a contradicting
        // guess of its own.
        part: product?.part ?? 'a',
        cpeVendor: product?.cpeVendor ?? '',
        cpeProduct: product?.cpeProduct ?? '',
      };
    });
  } catch {
    return [];
  }
}

/** Parses one or more complete NDJSON lines out of a growing text buffer,
 * returning the parsed events and the leftover (possibly partial) tail. */
function drainNdjson(buffer: string): { events: NdjsonEvent[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: NdjsonEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as NdjsonEvent);
    } catch {
      // Ignore a malformed line rather than breaking the whole stream.
    }
  }
  return { events, rest };
}

export default function VigiChat({ cadence = 'daily' as Cadence }: { cadence?: Cadence }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'streaming'>('idle');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: WELCOME, intro: true }]);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, open, pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const assetCount = useMemo(() => (open ? resolveInventory().length : 0), [open]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      const assets = resolveInventory();
      const history = [...messages, { role: 'user' as ChatRole, content: question }];
      setMessages([...history, { role: 'assistant', content: '', streaming: true }]);
      setDraft('');
      setPending(true);
      setPhase('checking');

      const controller = new AbortController();
      abortRef.current = controller;

      const setAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
        setMessages((current) => {
          const next = [...current];
          const lastIndex = next.length - 1;
          next[lastIndex] = updater(next[lastIndex]);
          return next;
        });
      };

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({
            cadence,
            assets,
            messages: history
              .filter((entry) => !entry.intro && (entry.role === 'user' || entry.role === 'assistant'))
              .slice(-12)
              .map((entry) => ({ role: entry.role, content: entry.content })),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload?.error ?? `Erreur ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawError: string | null = null;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = drainNdjson(buffer);
          buffer = rest;
          for (const event of events) {
            if (event.type === 'meta') {
              setAssistant((message) => ({
                ...message,
                sources: event.sources.slice(0, 8),
                usedContext: event.usedContext,
                assetCorrelation: event.assetCorrelation ?? undefined,
              }));
              setPhase('streaming');
            } else if (event.type === 'token') {
              setAssistant((message) => ({ ...message, content: message.content + event.text }));
            } else if (event.type === 'error') {
              sawError = event.message;
            }
          }
        }

        if (sawError) throw new Error(sawError);
        setAssistant((message) => ({
          ...message,
          streaming: false,
          content: message.content.trim() || 'Vigi n’a pas renvoyé de réponse.',
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        const detail = error instanceof Error ? error.message : 'Service indisponible.';
        setAssistant(() => ({
          role: 'assistant',
          error: true,
          content:
            `Vigi est indisponible (${detail}). L’inférence locale peut être lente au ` +
            'premier appel : réessayez dans quelques instants.',
        }));
      } finally {
        setPending(false);
        setPhase('idle');
        abortRef.current = null;
      }
    },
    [cadence, messages, pending],
  );

  return (
    <>
      <button
        type="button"
        className="vigi-fab"
        aria-expanded={open}
        aria-label={open ? 'Fermer Vigi' : 'Ouvrir Vigi, l’assistant OpenVigie'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="vigi-fab-orb" aria-hidden="true">
          <span className="vigi-fab-ring" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {open ? (
              <path d="m6 6 12 12M18 6 6 18" />
            ) : (
              <>
                <circle cx="12" cy="12" r="7.2" />
                <circle cx="12" cy="12" r="2.4" />
                <path d="M12 4.8V2.6M12 21.4v-2.2M19.2 12h2.2M2.6 12h2.2" />
              </>
            )}
          </svg>
        </span>
        <span>Vigi</span>
      </button>

      {open ? (
        <section className="vigi-panel glass-panel" aria-label="Vigi, assistant IA local d’OpenVigie">
          <div className="vigi-panel-glow" aria-hidden="true" />
          <header className="vigi-head">
            <div className="vigi-head-row">
              <span className="vigi-avatar" data-active={pending}>
                <span className="vigi-avatar-pulse" />
              </span>
              <div>
                <strong>Vigi</strong>
                <span>IA locale · Mistral 7B Instruct · corrélation parc en temps réel</span>
              </div>
              <span className="vigi-status" data-state={pending ? phase : 'ready'}>
                {pending ? (phase === 'checking' ? 'Analyse…' : 'Réponse…') : 'Prêt'}
              </span>
            </div>
            <p className="vigi-scope">
              {assetCount > 0
                ? `${assetCount} équipement${assetCount > 1 ? 's' : ''} du parc surveillé${assetCount > 1 ? 's' : ''}`
                : 'Aucun équipement déclaré dans « Mon parc »'}
            </p>
          </header>

          <div className="vigi-thread" ref={threadRef}>
            {messages.map((message, index) => (
              <article
                key={index}
                className={`vigi-msg vigi-msg-${message.role}${message.error ? ' vigi-msg-error' : ''}`}
              >
                {message.assetCorrelation && message.assetCorrelation.totalDeclared > 0 ? (
                  <AssetCorrelationBanner correlation={message.assetCorrelation} />
                ) : null}
                <p>
                  {message.content}
                  {message.streaming ? <span className="vigi-caret" aria-hidden="true" /> : null}
                </p>
                {message.usedContext?.bulletin ? (
                  <span className="vigi-context">Fondé sur le bulletin {message.usedContext.cadence}</span>
                ) : null}
                {message.sources && message.sources.length > 0 ? (
                  <ul className="vigi-sources">
                    {message.sources.map((source, position) => (
                      <li key={`${source.url}-${position}`}>
                        <a href={source.url} target="_blank" rel="noreferrer noopener">
                          {source.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {phase === 'checking' ? (
              <article className="vigi-msg vigi-msg-assistant vigi-msg-pending">
                <span className="vigi-scan" aria-hidden="true" />
                <p>Corrélation du parc avec le bulletin et CISA KEV…</p>
              </article>
            ) : null}
          </div>

          {messages.length <= 1 ? (
            <div className="vigi-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => send(suggestion)} disabled={pending}>
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="vigi-input"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder="Demandez à Vigi les vulnérabilités du bulletin, une alerte parc…"
              rows={2}
              disabled={pending}
              aria-label="Message pour Vigi"
            />
            <button type="submit" disabled={pending || !draft.trim()}>
              {pending ? <span className="vigi-caret vigi-caret-btn" aria-hidden="true" /> : 'Envoyer'}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

function AssetCorrelationBanner({ correlation }: { correlation: AssetCorrelation }) {
  const kevCount = correlation.affected.filter((asset) => asset.kev).length;
  const unverifiedNote =
    correlation.unverifiedCount > 0 ? (
      <span className="vigi-correlation-note">
        {correlation.unverifiedCount} équipement{correlation.unverifiedCount > 1 ? 's' : ''} pas encore
        vérifié{correlation.unverifiedCount > 1 ? 's' : ''} — ouvrez « Mon parc » pour lancer l’analyse.
      </span>
    ) : null;

  if (correlation.affected.length === 0) {
    return (
      <div className="vigi-correlation vigi-correlation-clear">
        <strong>✓ Aucune vulnérabilité connue</strong>
        <span>
          {correlation.notAffectedCount} équipement{correlation.notAffectedCount > 1 ? 's' : ''} vérifié
          {correlation.notAffectedCount > 1 ? 's' : ''} via Mon parc, sans CVE recensée.
        </span>
        {unverifiedNote}
      </div>
    );
  }
  return (
    <div className={`vigi-correlation${kevCount > 0 ? ' vigi-correlation-kev' : ' vigi-correlation-warn'}`}>
      <strong>
        {kevCount > 0 ? '⚠ ' : '● '}
        {correlation.affected.length} équipement{correlation.affected.length > 1 ? 's' : ''} potentiellement
        affecté{correlation.affected.length > 1 ? 's' : ''}
        {kevCount > 0 ? ` · ${kevCount} en exploitation active (CISA KEV)` : ''}
      </strong>
      <ul>
        {correlation.affected.slice(0, 5).map((asset) => (
          <li key={asset.label}>
            <span className="vigi-asset-name">{asset.label || `${asset.vendor} ${asset.product}`}</span>
            {!asset.verified ? <em className="vigi-unverified-tag">signal bulletin</em> : null}
            {asset.cves.slice(0, 3).map((cve) => (
              <code key={cve} className={asset.kevCves.includes(cve) ? 'vigi-cve vigi-cve-kev' : 'vigi-cve'}>
                {cve}
              </code>
            ))}
          </li>
        ))}
      </ul>
      {unverifiedNote}
    </div>
  );
}
