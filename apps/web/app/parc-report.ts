// Standalone HTML export of "Mon parc": one self-contained file, all CSS inline,
// no network dependency, built entirely from data already loaded in the browser.
// Sober analytical layout (dark ground, cyan/red accents) with CSS page breaks
// so each equipment prints on its own page.
import type { Vulnerability } from './vulnerability-types';

export type ParcReportAsset = {
  label: string;
  vendor: string;
  product: string;
  version: string;
  exposure: string;
  advisoryUrl: string;
  matchingMessage?: string;
  vulnerabilities: Vulnerability[];
};

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const;
type SeverityKey = (typeof SEVERITY_ORDER)[number];

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityKey(raw: string): SeverityKey {
  const upper = (raw || '').toUpperCase();
  return (SEVERITY_ORDER as readonly string[]).includes(upper) ? (upper as SeverityKey) : 'UNKNOWN';
}

function advisoryFor(cve: Vulnerability, fallback: string): string {
  const vendorAdvisory = cve.references.find((ref) => ref.tags?.includes('Vendor Advisory') && /^https?:\/\//.test(ref.url));
  if (vendorAdvisory) return vendorAdvisory.url;
  const anyRef = cve.references.find((ref) => /^https?:\/\//.test(ref.url));
  if (anyRef) return anyRef.url;
  if (/^https?:\/\//.test(fallback)) return fallback;
  return `https://nvd.nist.gov/vuln/detail/${cve.id}`;
}

function shortDescription(value: string): string {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  return text.length > 320 ? `${text.slice(0, 317)}…` : text || '—';
}

function severityChart(counts: Record<SeverityKey, number>): string {
  const max = Math.max(1, ...SEVERITY_ORDER.map((key) => counts[key]));
  const rowHeight = 30;
  const rows = SEVERITY_ORDER.map((key, index) => {
    const value = counts[key];
    const width = Math.round((value / max) * 320);
    const y = index * rowHeight + 6;
    return `
      <text x="0" y="${y + 14}" class="chart-label">${key}</text>
      <rect x="96" y="${y}" width="${Math.max(width, value > 0 ? 3 : 0)}" height="18" rx="3" class="bar bar-${key}"></rect>
      <text x="${96 + Math.max(width, 3) + 8}" y="${y + 14}" class="chart-value">${value}</text>`;
  }).join('');
  return `<svg viewBox="0 0 470 ${SEVERITY_ORDER.length * rowHeight + 12}" role="img" aria-label="Répartition des CVE par sévérité" class="severity-chart">${rows}</svg>`;
}

export function buildParcReportHtml(assets: ParcReportAsset[], generatedAt: Date = new Date()): string {
  const counts: Record<SeverityKey, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  let totalFindings = 0;
  let kevFindings = 0;
  const distinct = new Set<string>();

  for (const asset of assets) {
    for (const cve of asset.vulnerabilities) {
      totalFindings += 1;
      distinct.add(cve.id);
      counts[severityKey(cve.severity)] += 1;
      if (cve.kev) kevFindings += 1;
    }
  }

  const generatedLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(generatedAt);

  const sections = assets.map((asset, index) => {
    const rows = [...asset.vulnerabilities]
      .sort((a, b) => (SEVERITY_ORDER.indexOf(severityKey(a.severity)) - SEVERITY_ORDER.indexOf(severityKey(b.severity)))
        || (b.score ?? 0) - (a.score ?? 0))
      .map((cve) => `
            <tr>
              <td class="mono">${esc(cve.id)}</td>
              <td><span class="sev sev-${severityKey(cve.severity)}">${esc(cve.severity || 'UNKNOWN')}</span></td>
              <td class="num">${cve.score ?? '—'}</td>
              <td>${cve.kev ? `<span class="kev">Exploitée (KEV${cve.kev.dateAdded ? ` · ${esc(cve.kev.dateAdded)}` : ''})</span>` : '<span class="muted">Non</span>'}</td>
              <td class="desc">${esc(shortDescription(cve.description))}</td>
              <td><a href="${esc(advisoryFor(cve, asset.advisoryUrl))}">Avis</a></td>
            </tr>`).join('');

    return `
      <section class="equipment${index === 0 ? ' first' : ''}">
        <h2>${esc(asset.label || asset.product)}</h2>
        <dl class="meta">
          <div><dt>Éditeur / produit</dt><dd>${esc(asset.vendor)} · ${esc(asset.product)}</dd></div>
          <div><dt>Version installée</dt><dd>${esc(asset.version || 'Non précisée')}</dd></div>
          <div><dt>Exposition</dt><dd>${esc(asset.exposure || '—')}</dd></div>
          <div><dt>CVE corrélées</dt><dd>${asset.vulnerabilities.length}</dd></div>
        </dl>
        ${asset.vulnerabilities.length === 0
          ? `<p class="clear">Aucune CVE confirmée pour cette version.${asset.matchingMessage ? ` ${esc(asset.matchingMessage)}` : ''}</p>`
          : `<table>
            <thead><tr><th>CVE</th><th>Sévérité</th><th>CVSS</th><th>CISA KEV</th><th>Description</th><th>Réf.</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
      </section>`;
  }).join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenVigie — Rapport de parc — ${esc(generatedLabel)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 32px 64px; background: #0a0e16; color: #e7ecf5;
    font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  a { color: #58f3ff; }
  h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: .01em; }
  h2 { margin: 0 0 14px; font-size: 17px; color: #58f3ff; border-bottom: 1px solid #1e2a3d; padding-bottom: 8px; }
  .doc { max-width: 940px; margin: 0 auto; }
  header.report { border-bottom: 1px solid #1e2a3d; padding-bottom: 18px; margin-bottom: 26px; }
  header.report .kicker { color: #7d8aa3; text-transform: uppercase; letter-spacing: .18em; font-size: 10px; }
  header.report .gen { color: #7d8aa3; font-size: 12px; margin-top: 6px; }
  .lead { font-size: 15px; line-height: 1.6; margin: 0 0 22px; }
  .lead strong { color: #ffffff; }
  .lead .crit { color: #ff5b6f; font-weight: 700; }
  .lead .kevword { color: #ff9d4d; font-weight: 700; }
  .panel { border: 1px solid #1e2a3d; border-radius: 10px; padding: 20px 22px; background: #0e1420; }
  .severity-chart { width: 100%; max-width: 470px; height: auto; margin-top: 6px; }
  .chart-label { fill: #9fb0c9; font-size: 11px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .chart-value { fill: #e7ecf5; font-size: 11px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .bar { fill: #3a7d8c; }
  .bar-CRITICAL { fill: #ff5b6f; }
  .bar-HIGH { fill: #ff9d4d; }
  .bar-MEDIUM { fill: #58f3ff; }
  .bar-LOW { fill: #3f7d5a; }
  .bar-UNKNOWN { fill: #4a5570; }
  .equipment { margin-top: 30px; }
  .equipment .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; margin: 0 0 16px; }
  .equipment .meta div { display: flex; gap: 8px; }
  .equipment dt { color: #7d8aa3; font-size: 12px; min-width: 128px; }
  .equipment dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #182130; vertical-align: top; }
  th { color: #9fb0c9; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  td.mono, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.desc { color: #c4cee0; }
  .muted { color: #7d8aa3; }
  .clear { color: #7bdca0; }
  .sev { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid currentColor; }
  .sev-CRITICAL { color: #ff5b6f; }
  .sev-HIGH { color: #ff9d4d; }
  .sev-MEDIUM { color: #58f3ff; }
  .sev-LOW { color: #7bdca0; }
  .sev-UNKNOWN { color: #9fb0c9; }
  .kev { color: #ff9d4d; font-weight: 600; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #1e2a3d; color: #7d8aa3; font-size: 11px; }
  @media print {
    body { background: #ffffff; color: #10151f; padding: 0; }
    a { color: #0b6f8c; }
    .panel, .equipment .meta div, header.report, footer { border-color: #d0d7e2; }
    .panel { background: #f6f8fb; }
    h2 { color: #0b6f8c; border-color: #d0d7e2; }
    th, td { border-color: #dde3ec; }
    td.desc { color: #333c4d; }
    .equipment { break-before: page; }
    .equipment.first { break-before: auto; }
  }
</style>
</head>
<body>
<div class="doc">
  <header class="report">
    <div class="kicker">OpenVigie · Rapport de parc</div>
    <h1>Synthèse de l'exposition du parc</h1>
    <div class="gen">Généré le ${esc(generatedLabel)} · document autonome, sans connexion réseau</div>
  </header>

  <p class="lead">
    Votre parc contient <strong>${assets.length}</strong> équipement${assets.length > 1 ? 's' : ''}
    et <strong>${totalFindings}</strong> CVE corrélée${totalFindings > 1 ? 's' : ''}
    (${distinct.size} identifiant${distinct.size > 1 ? 's' : ''} distinct${distinct.size > 1 ? 's' : ''}),
    dont <span class="crit">${counts.CRITICAL}</span> CRITICAL
    et <span class="kevword">${kevFindings}</span> exploitée${kevFindings > 1 ? 's' : ''} activement (CISA KEV).
  </p>

  <div class="panel">
    <strong>Répartition par sévérité</strong>
    ${severityChart(counts)}
  </div>

  ${sections || '<p class="muted" style="margin-top:28px">Aucun équipement dans le parc.</p>'}

  <footer>
    Corrélation CPE stricte NVD + CISA KEV. Une absence de CVE dépend de la couverture NVD et ne prouve pas
    l'absence de vulnérabilité — confirmez toujours dans l'avis de l'éditeur.
  </footer>
</div>
</body>
</html>`;
}

export function downloadParcReport(assets: ParcReportAsset[], generatedAt: Date = new Date()): void {
  const html = buildParcReportHtml(assets, generatedAt);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `openvigie-rapport-parc-${stamp}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
