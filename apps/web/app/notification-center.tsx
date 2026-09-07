'use client';
import { useCallback, useEffect, useState } from 'react';
import { alertsRequest, useDismiss } from './alerts-client';
type Notification = { confidence: string; id: number; product: string; cve_id: string; severity: string; advisory_url: string; read: number; email_sent: number; created_at: number };
export default function NotificationCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useDismiss(open, () => onOpenChange(false));
  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const result = await alertsRequest<{ notifications: Notification[]; unread_count: number; has_more: boolean }>(`notifications?offset=${offset}`);
      setItems(previous => offset ? [...previous, ...result.notifications].filter((n, i, all) => all.findIndex(x => x.id === n.id) === i) : result.notifications);
      setUnread(result.unread_count); setMore(result.has_more); setError('');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const initial = setTimeout(() => void load(), 0); const timer = window.setInterval(() => { if (!document.hidden && !open) void load(); }, 30000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [load, open]);
  async function mark(id?: number) {
    try { await alertsRequest(id === undefined ? 'notifications/mark-all-read' : 'notifications/read', 'POST', { id }); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  return <div ref={ref} className="alerts-anchor">
    <button type="button" className="icon-button notification-trigger" aria-label={`Notifications, ${unread} non lues${error ? ', service indisponible' : ''}`} aria-expanded={open} aria-controls="notification-panel" onClick={() => onOpenChange(!open)}>🔔{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}{error && <span className="notification-badge">!</span>}</button>
    {open && <section id="notification-panel" aria-label="Centre de notifications" className="alerts-popover notification-panel">
      <h2>Notifications <small>{unread} non lues</small></h2>
      <div className="alerts-buttons"><button disabled={!unread || loading} onClick={() => void mark()}>Tout marquer comme lu</button><button disabled={loading} onClick={() => void load()}>Actualiser</button></div>
      {error && <p role="alert" className="alerts-error">{error}</p>}
      {!error && !items.length && <p>{loading ? 'Chargement…' : 'Aucune CVE détectée pour le parc suivi.'}</p>}
      <ul className="notification-list">{items.map(n => <li key={n.id} className={n.read ? '' : 'unread'}>
        <strong>{n.cve_id}</strong>{n.confidence !== 'confirmed' && <span className="badge">à vérifier</span>}<span className="notification-severity">{n.severity}</span><p>{n.product}</p>
        <small>{new Date(n.created_at * 1000).toLocaleString('fr-FR')} · {n.email_sent ? 'Email envoyé' : 'Email non envoyé'}</small>
        <p><a href={/^https?:\/\//.test(n.advisory_url) ? n.advisory_url : `https://nvd.nist.gov/vuln/detail/${n.cve_id}`} target="_blank" rel="noopener noreferrer">Consulter l’avis ↗</a></p>
        {!n.read && <button onClick={() => void mark(n.id)}>Marquer comme lu</button>}
      </li>)}</ul>{more && <button disabled={loading} onClick={() => void load(items.length)}>Afficher les précédentes</button>}
    </section>}
  </div>;
}
