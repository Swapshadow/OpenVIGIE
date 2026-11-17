'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findProduct, findVendor, vendorCatalog } from './asset-catalog';
import { downloadParcReport, type ParcReportAsset } from './parc-report';
import type { InventoryAsset, Vulnerability, VulnerabilityResponse } from './vulnerability-types';
import InfrastructureMap from './infrastructure-map';

type DossierTab = 'summary' | 'attack' | 'evidence';
type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'KEV';

const AUTO_REFRESH_MS = 24 * 60 * 60 * 1000;
const CUSTOM_VERSION = '__custom__';

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function impactLabel(value: string | null) {
  return ({ HIGH: 'Élevé', LOW: 'Faible', NONE: 'Aucun' } as Record<string, string>)[value ?? ''] ?? 'Non renseigné';
}

function humanValue(value: string | null) {
  return value ? value.toLowerCase().replaceAll('_', ' ') : 'non renseigné';
}

export default function InventoryWorkspace() {
  const [inventory, setInventory] = useState<InventoryAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [vendorId, setVendorId] = useState(vendorCatalog[0].id);
  const [productId, setProductId] = useState(vendorCatalog[0].products[0].id);
  const [version, setVersion] = useState('');
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsStale, setVersionsStale] = useState(false);
  const [customVersion, setCustomVersion] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [label, setLabel] = useState('');
  const [exposure, setExposure] = useState('Réseau interne');
  const [kind, setKind] = useState<InventoryAsset['kind']>('server');
  const [formOpen, setFormOpen] = useState(true);
  const [formError, setFormError] = useState('');
  const [data, setData] = useState<VulnerabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedCveId, setSelectedCveId] = useState('');
  const [dossierTab, setDossierTab] = useState<DossierTab>('summary');
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [search, setSearch] = useState('');
  const [deepPatchOpen, setDeepPatchOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportStatus, setReportStatus] = useState('');
  const requestSequence = useRef(0);

  const selectedVendor = findVendor(vendorId);
  const selectedProduct = findProduct(vendorId, productId);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => {
      setAvailableVersions([]);
      setVersionsStale(false);
      setVersionsLoading(false);
      if (!selectedProduct.cpeVendor || !selectedProduct.cpeProduct) return;
      setVersionsLoading(true);
      const params = new URLSearchParams({
        part: selectedProduct.part,
        cpeVendor: selectedProduct.cpeVendor,
        cpeProduct: selectedProduct.cpeProduct,
      });
      void fetch(`/api/catalog/versions?${params}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { versions?: string[]; stale?: boolean; error?: string };
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error(payload.error ?? 'Versions indisponibles');
          setAvailableVersions(payload.versions ?? []);
          setVersionsStale(Boolean(payload.stale));
        })
        .catch(() => {
          if (!controller.signal.aborted) setVersionsStale(true);
        })
        .finally(() => { if (!controller.signal.aborted) setVersionsLoading(false); });
    }, 0);
    return () => { window.clearTimeout(initial); controller.abort(); };
  }, [selectedProduct]);

  // Free-text search across the whole catalog: with 55 brands, walking two
  // chained dropdowns to find "macOS" is slower than typing it.
  const catalogMatches = useMemo(() => {
    const needle = catalogQuery.trim().toLowerCase();
    if (needle.length < 2) return [];
    const hits: Array<{ vendor: typeof vendorCatalog[number]; product: typeof vendorCatalog[number]['products'][number] }> = [];
    for (const vendor of vendorCatalog) {
      for (const product of vendor.products) {
        const haystack = `${vendor.name} ${product.name} ${product.family}`.toLowerCase();
        if (haystack.includes(needle)) hits.push({ vendor, product });
        if (hits.length >= 8) return hits;
      }
    }
    return hits;
  }, [catalogQuery]);

  const selectFromCatalog = (nextVendorId: string, nextProductId: string) => {
    setVendorId(nextVendorId);
    setProductId(nextProductId);
    setVersion('');
    setCustomVersion(false);
    setCatalogQuery('');
  };
  const selectedAsset = inventory.find((asset) => asset.id === selectedAssetId) ?? inventory[0] ?? null;
  const assetVendor = selectedAsset ? findVendor(selectedAsset.vendorId) : null;
  const assetProduct = selectedAsset ? findProduct(selectedAsset.vendorId, selectedAsset.productId) : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/assets', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { assets?: InventoryAsset[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Inventaire indisponible.');
        const assets = payload.assets ?? [];
        setInventory(assets);
        setSelectedAssetId(assets[0]?.id ?? '');
        setFormOpen(assets.length === 0);
      })
      .catch((error) => { if (!controller.signal.aborted) setFormError(error instanceof Error ? error.message : 'Inventaire indisponible.'); });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!selectedAsset || !assetVendor || !assetProduct) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError('');

    const params = new URLSearchParams({
      vendor: assetVendor.name,
      product: assetProduct.name,
      version: selectedAsset.version,
      part: assetProduct.part,
    });
    if (assetProduct.cpeVendor) params.set('cpeVendor', assetProduct.cpeVendor);
    if (assetProduct.cpeProduct) params.set('cpeProduct', assetProduct.cpeProduct);
    if (force) params.set('force', '1');

    try {
      const response = await fetch(`/api/vulnerabilities?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as VulnerabilityResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'La synchronisation a échoué.');
      if (requestId !== requestSequence.current) return;
      setData(payload);
      setSelectedCveId((current) => payload.vulnerabilities.some((item) => item.id === current)
        ? current
        : payload.vulnerabilities[0]?.id ?? '');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setLoadError(error instanceof Error ? error.message : 'La synchronisation a échoué.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [assetProduct, assetVendor, selectedAsset]);

  useEffect(() => {
    if (!selectedAsset) return;
    const initial = window.setTimeout(() => void refresh(false), 0);
    const timer = window.setInterval(() => void refresh(false), AUTO_REFRESH_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh, selectedAsset]);

  // Standalone HTML export: pull the CVE snapshot for every asset (same endpoint
  // the workspace already uses per asset), then hand the rows to parc-report.
  const exportReport = useCallback(async () => {
    if (reportBusy || inventory.length === 0) return;
    setReportBusy(true);
    setReportStatus('Génération du rapport…');
    const rows: ParcReportAsset[] = [];
    try {
      for (let index = 0; index < inventory.length; index += 1) {
        const asset = inventory[index];
        const vendor = findVendor(asset.vendorId);
        const product = findProduct(asset.vendorId, asset.productId);
        setReportStatus(`Analyse ${index + 1}/${inventory.length} · ${asset.label || product.name}`);
        const params = new URLSearchParams({
          vendor: vendor.name, product: product.name, version: asset.version, part: product.part,
        });
        if (product.cpeVendor) params.set('cpeVendor', product.cpeVendor);
        if (product.cpeProduct) params.set('cpeProduct', product.cpeProduct);
        let vulnerabilities: Vulnerability[] = [];
        let matchingMessage: string | undefined;
        try {
          const response = await fetch(`/api/vulnerabilities?${params.toString()}`, { cache: 'no-store' });
          const payload = await response.json() as VulnerabilityResponse & { error?: string };
          if (response.ok) {
            vulnerabilities = payload.vulnerabilities ?? [];
            matchingMessage = payload.matching?.message;
          } else {
            matchingMessage = payload.error ?? 'Synchronisation indisponible pour cet équipement.';
          }
        } catch {
          matchingMessage = 'Synchronisation indisponible pour cet équipement.';
        }
        rows.push({
          label: asset.label || product.name,
          vendor: vendor.name,
          product: product.name,
          version: asset.version,
          exposure: asset.exposure,
          advisoryUrl: product.advisoryUrl,
          matchingMessage,
          vulnerabilities,
        });
      }
      downloadParcReport(rows);
      setReportStatus('Rapport téléchargé.');
    } catch {
      setReportStatus('Échec de la génération du rapport.');
    } finally {
      setReportBusy(false);
      window.setTimeout(() => setReportStatus(''), 4000);
    }
  }, [inventory, reportBusy]);

  const filteredVulnerabilities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.vulnerabilities ?? []).filter((item) => {
      const matchesSeverity = severity === 'ALL'
        || (severity === 'KEV' ? Boolean(item.kev) : item.severity === severity);
      const matchesSearch = !query || item.id.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
      return matchesSeverity && matchesSearch;
    });
  }, [data, search, severity]);

  const selectedCve = data?.vulnerabilities.find((item) => item.id === selectedCveId)
    ?? filteredVulnerabilities[0]
    ?? null;

  const addAsset = async () => {
    if (!selectedProduct.versionOptional && !version.trim()) {
      setFormError('Indique la version installée pour obtenir une corrélation fiable.');
      return;
    }

    setFormError('');
    const response = await fetch('/api/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendorId, productId, vendorName: selectedVendor.name, productName: selectedProduct.name,
        label: label.trim() || selectedProduct.name, version: version.trim(), exposure, kind,
        part: selectedProduct.part, cpeVendor: selectedProduct.cpeVendor ?? '', cpeProduct: selectedProduct.cpeProduct ?? '',
      }),
    });
    const payload = await response.json() as { asset?: InventoryAsset; error?: string };
    if (!response.ok || !payload.asset) {
      setFormError(payload.error ?? 'Ajout impossible.');
      return;
    }
    setInventory((current) => [...current, payload.asset!]);
    requestSequence.current += 1;
    setSelectedAssetId(payload.asset.id);
    setData(null);
    setLabel('');
    setVersion('');
    setCustomVersion(false);
    setCatalogQuery('');
    setFormError('');
    setFormOpen(false);
  };

  const removeAsset = async (asset: InventoryAsset) => {
    if (!window.confirm(`Retirer « ${asset.label} » du parc OpenVigie ?`)) return;
    const vendor = findVendor(asset.vendorId);
    const product = findProduct(asset.vendorId, asset.productId);
    const params = new URLSearchParams({
      vendor: vendor.name,
      product: product.name,
      version: asset.version,
      part: product.part,
    });
    if (product.cpeVendor) params.set('cpeVendor', product.cpeVendor);
    if (product.cpeProduct) params.set('cpeProduct', product.cpeProduct);
    const response = await fetch(`/api/assets?id=${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setLoadError('Suppression impossible pour cet équipement.');
      return;
    }
    void fetch(`/api/vulnerabilities?${params.toString()}`, { method: 'DELETE' });
    const remaining = inventory.filter((item) => item.id !== asset.id);
    requestSequence.current += 1;
    setInventory(remaining);
    setSelectedAssetId(remaining[0]?.id ?? '');
    setData(null);
    setFormOpen(remaining.length === 0);
  };

  return (
    <section className="content inventory-workspace" id="main-content">
      <div className="page-heading inventory-heading">
        <div>
          <p className="eyebrow neon">Infrastructure intelligence</p>
          <h1>Mon parc</h1>
          <p>Ajoutez vos versions réellement installées ; OpenVigie les rapproche des sources publiques.</p>
        </div>
        <div className="inventory-actions">
          <span className="auto-refresh"><i /> Actualisation CVE · quotidienne</span>
          {reportStatus ? <span className="report-status" role="status">{reportStatus}</span> : null}
          <button
            type="button"
            className="ghost-action"
            onClick={() => void exportReport()}
            disabled={reportBusy || inventory.length === 0}
          >
            {reportBusy ? 'Génération…' : 'Exporter rapport HTML'}
          </button>
          <button type="button" className="primary-action" onClick={() => setFormOpen((open) => !open)}>{formOpen ? 'Fermer' : '+ Ajouter un équipement'}</button>
        </div>
      </div>

      <InfrastructureMap assets={inventory} selectedId={selectedAssetId} onSelect={setSelectedAssetId} />

      {formOpen && (
        <section className="asset-builder glass-panel" aria-labelledby="asset-builder-title">
          <header>
            <div><span>01</span><h2 id="asset-builder-title">Décrire un équipement</h2></div>
            <p>La marque, le produit et la version servent à construire la correspondance CPE.</p>
          </header>
          <label className="asset-finder">
            <span>Rechercher un équipement</span>
            <input
              type="search"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Ex. Stormshield, macOS, FortiGate, Chrome…"
              aria-label="Rechercher dans le catalogue"
            />
            {catalogQuery.trim() ? (
              catalogMatches.length ? (
                <ul className="asset-finder-results">
                  {catalogMatches.map(({ vendor, product }) => (
                    <li key={`${vendor.id}:${product.id}`}>
                      <button type="button" onClick={() => selectFromCatalog(vendor.id, product.id)}>
                        <strong>{product.name}</strong>
                        <em>{vendor.name}</em>
                        <span>{product.family}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="asset-finder-empty">
                  Aucun équipement du catalogue ne correspond. {vendorCatalog.length} marques couvertes.
                </p>
              )
            ) : null}
          </label>

          <div className="asset-form-grid">
            <label>
              <span>Marque</span>
              <select value={vendorId} onChange={(event) => {
                const nextVendor = findVendor(event.target.value);
                setVendorId(nextVendor.id);
                setProductId(nextVendor.products[0].id);
                setVersion('');
                setCustomVersion(false);
              }}>
                {[...vendorCatalog].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })).map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}
              </select>
            </label>
            <label>
              <span>Équipement / logiciel</span>
              <select value={productId} onChange={(event) => { setProductId(event.target.value); setVersion(''); setCustomVersion(false); }}>
                {selectedVendor.products.map((product) => (
                  <option value={product.id} key={product.id}>{product.name} · {product.family}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Version installée {selectedProduct.versionOptional ? '(facultatif)' : ''}</span>
              {/* A version NVD never indexed silently returns zero CVE, which reads
                  as "nothing affects me". The known list is therefore the default
                  path, and free text is an explicit opt-out. */}
              {customVersion ? (
                <input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder={selectedProduct.versionOptional ? 'Service SaaS' : 'Ex. 7.4.2'}
                  autoFocus
                />
              ) : (
                <select
                  value={version}
                  onChange={(event) => {
                    if (event.target.value === CUSTOM_VERSION) {
                      setCustomVersion(true);
                      setVersion('');
                      return;
                    }
                    setVersion(event.target.value);
                  }}
                >
                  <option value="">{versionsLoading ? 'Chargement depuis le NVD…' : selectedProduct.versionOptional ? 'Non applicable' : 'Choisir une version…'}</option>
                  {availableVersions.map((item) => <option value={item} key={item}>{item}</option>)}
                  <option value={CUSTOM_VERSION}>Autre version…</option>
                </select>
              )}
              {versionsStale ? <small>Cache NVD indisponible ou ancien — utilisez la saisie libre si nécessaire.</small> : null}
              {customVersion ? (
                <button type="button" className="version-back" onClick={() => { setCustomVersion(false); setVersion(''); }}>
                  ← Versions connues
                </button>
              ) : null}
            </label>
            <label>
              <span>Nom dans votre parc</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex. FW-PARIS-01" />
            </label>
            <label>
              <span>Exposition</span>
              <select value={exposure} onChange={(event) => setExposure(event.target.value)}>
                <option>Exposé sur Internet</option>
                <option>Réseau interne</option>
                <option>Administration uniquement</option>
                <option>Postes utilisateurs</option>
                <option>Cloud / SaaS</option>
              </select>
            </label>
            <label>
              <span>Type de nœud</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as InventoryAsset['kind'])}>
                <option value="server">Serveur</option><option value="workstation">Poste de travail</option>
                <option value="switch">Commutateur</option><option value="router">Routeur</option>
                <option value="firewall">Pare-feu</option><option value="phone">Téléphone</option>
                <option value="cloud">Cloud</option><option value="service">Service</option>
              </select>
            </label>
            <button type="button" className="save-asset" onClick={() => void addAsset()}>Ajouter au parc</button>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <p className="privacy-note">L’inventaire est enregistré dans le volume Docker et isolé par organisation. Aucun identifiant technique, adresse IP ou secret n’est demandé.</p>
        </section>
      )}

      {inventory.length === 0 ? (
        <section className="empty-inventory glass-panel">
          <span>◫</span>
          <h2>Votre parc est vide</h2>
          <p>Commencez par choisir une marque, un produit et sa version exacte.</p>
          {!formOpen && <button type="button" className="primary-action" onClick={() => setFormOpen(true)}>Ajouter le premier équipement</button>}
        </section>
      ) : (
        <>
          <div className="asset-grid dynamic-assets" aria-label="Équipements surveillés">
            {inventory.map((asset) => {
              const vendor = findVendor(asset.vendorId);
              const product = findProduct(asset.vendorId, asset.productId);
              const count = asset.id === selectedAssetId ? data?.vulnerabilities.length : undefined;
              return (
                <button className="asset-card glass-panel" type="button" aria-pressed={selectedAsset?.id === asset.id} key={asset.id} onClick={() => {
                  requestSequence.current += 1;
                  setSelectedAssetId(asset.id);
                  setData(null);
                  setSelectedCveId('');
                  setDeepPatchOpen(false);
                }}>
                  <span className="asset-monogram" aria-hidden="true">{vendor.short}</span>
                  <span className="asset-copy"><strong>{asset.label}</strong><small>{product.name} · {asset.version || 'SaaS'}</small></span>
                  <span className="alert-count">{count === undefined ? '··' : String(count).padStart(2, '0')}</span>
                </button>
              );
            })}
          </div>

          {selectedAsset && assetVendor && assetProduct && (
            <section className="monitor-panel glass-panel">
              <header className="monitor-heading">
                <div>
                  <p>{assetVendor.name} · {assetProduct.family}</p>
                  <h2>{selectedAsset.label}</h2>
                  <span>{assetProduct.name} {selectedAsset.version || 'SaaS'} · {selectedAsset.exposure}</span>
                </div>
                <div className="monitor-actions">
                  <a href={assetProduct.advisoryUrl} target="_blank" rel="noreferrer">Avis éditeur ↗</a>
                  <button type="button" onClick={() => void refresh(true)} disabled={loading}>{loading ? 'Synchronisation…' : 'Actualiser'}</button>
                  <button type="button" className="deep-patch-trigger" onClick={() => setDeepPatchOpen((open) => !open)} disabled={!selectedCve}>{deepPatchOpen ? 'Fermer le patch' : 'Patch en profondeur'}</button>
                  <button type="button" className="danger-action" onClick={() => void removeAsset(selectedAsset)}>Retirer</button>
                </div>
              </header>

              <div className="source-ribbon">
                <div><span>Dernière collecte</span><strong>{data ? formatDate(data.fetchedAt) : 'En attente'}</strong></div>
                <div><span>Correspondance</span><strong>{data?.matching.method === 'cpe' ? data.matching.usesNvdAffected ? 'CPE + plages NVD' : 'CPE + version' : data?.matching.message ?? 'En attente'}</strong></div>
                <div><span>Résultats NVD</span><strong>{data?.totalResults ?? '—'}</strong></div>
                <div><span>Exploitées (KEV)</span><strong>{data?.vulnerabilities.filter((item) => item.kev).length ?? '—'}</strong></div>
              </div>

              {loadError && <div className="source-error" role="alert"><strong>Veille momentanément indisponible</strong><span>{loadError}</span><button type="button" onClick={() => void refresh(true)}>Réessayer</button></div>}
              {data?.stale && <div className="source-error stale-warning" role="status"><strong>Dernier instantané connu</strong><span>{data.warning}</span><button type="button" onClick={() => void refresh(true)}>Réessayer</button></div>}

              {data?.relatedArticles.length ? (
                <section className="asset-alerts" aria-labelledby="asset-alerts-title">
                  <header>
                    <div><span>CORRÉLATION PARC ↔ VEILLE</span><h3 id="asset-alerts-title">Alertes liées à cet équipement</h3></div>
                    <strong>{data.relatedArticles.length} correspondance{data.relatedArticles.length > 1 ? 's' : ''}</strong>
                  </header>
                  <div className="asset-alert-grid">
                    {data.relatedArticles.map((article) => (
                      <a href={article.url} target="_blank" rel="noreferrer" key={article.id}>
                        <span className={article.source.id.startsWith('cert-fr') ? 'cert-source' : ''}>{article.category}</span>
                        <h4>{article.title}</h4>
                        <p>{article.excerpt}</p>
                        <footer><strong>{article.source.name}</strong><small>{article.matchReasons.slice(0, 3).join(' · ')}</small></footer>
                      </a>
                    ))}
                  </div>
                </section>
              ) : data && !loading ? (
                <div className="asset-alerts-empty"><strong>Aucune alerte éditoriale corrélée</strong><span>La surveillance quotidienne reste active pour cette marque, ce produit et cette version.</span></div>
              ) : null}

              {deepPatchOpen && selectedCve ? <DeepPatchPanel cve={selectedCve} asset={selectedAsset} productName={assetProduct.name} advisoryUrl={assetProduct.advisoryUrl} /> : null}

              <div className="vulnerability-tools">
                <label><span className="sr-only">Rechercher une CVE</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher CVE ou mot-clé…" /></label>
                <div className="severity-filters" aria-label="Filtrer par gravité">
                  {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'KEV'] as const).map((filter) => (
                    <button type="button" aria-pressed={severity === filter} onClick={() => setSeverity(filter)} key={filter}>{filter === 'ALL' ? 'Toutes' : filter === 'KEV' ? 'CISA KEV' : filter}</button>
                  ))}
                </div>
              </div>

              <div className="monitor-body">
                <aside className="vulnerability-list" aria-label="Vulnérabilités correspondantes">
                  {loading && !data && <div className="loading-state"><i /><span>Interrogation des sources officielles…</span></div>}
                  {!loading && data && filteredVulnerabilities.length === 0 && <div className="no-results"><strong>Aucun résultat</strong><span>{data.matching.method === 'none' ? data.matching.message : 'Aucune CVE avec un CPE ou une plage de versions NVD couvrant cette version.'}</span></div>}
                  {filteredVulnerabilities.map((cve) => (
                    <button type="button" className="vulnerability-row" aria-current={selectedCve?.id === cve.id ? 'true' : undefined} onClick={() => setSelectedCveId(cve.id)} key={cve.id}>
                      <span className="cve-line"><strong>{cve.id}</strong>{cve.kev && <em>KEV</em>}</span>
                      <span className="vulnerability-summary">{cve.description}</span>
                      <span className="vulnerability-score" data-severity={cve.severity}><b>{cve.score ?? '—'}</b>{cve.severity}</span>
                    </button>
                  ))}
                </aside>

                <article className="live-dossier" aria-live="polite">
                  {selectedCve ? <CveDossier cve={selectedCve} productName={assetProduct.name} advisoryUrl={assetProduct.advisoryUrl} tab={dossierTab} onTab={setDossierTab} /> : (
                    <div className="no-selection"><span>◇</span><h3>Sélectionnez une vulnérabilité</h3><p>La fiche affichera l’impact, les conditions d’exploitation et les sources de remédiation.</p></div>
                  )}
                </article>
              </div>

              <footer className="source-status-bar">
                {(data?.sources ?? []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.name}><i data-status={source.status} /><span>{source.name}</span><small>{source.detail}</small></a>)}
                <span className="matching-warning">Correspondance par CPE ou plage de versions structurée NVD ; confirmez le composant et la version installés.</span>
              </footer>
            </section>
          )}
        </>
      )}
    </section>
  );
}

function CveDossier({ cve, productName, advisoryUrl, tab, onTab }: { cve: Vulnerability; productName: string; advisoryUrl: string; tab: DossierTab; onTab: (tab: DossierTab) => void }) {
  const remediationRefs = cve.references.filter((reference) => reference.tags.some((tag) => ['Patch', 'Vendor Advisory', 'Mitigation'].includes(tag)));
  const displayedRefs = (remediationRefs.length ? remediationRefs : cve.references).slice(0, 8);

  return (
    <>
      <header className="live-dossier-heading">
        <div><p>{cve.id}</p><h2>{productName}</h2><span>Publié {formatDate(cve.published)} · modifié {formatDate(cve.lastModified)}</span></div>
        <div className="badges"><span className="badge critical">{cve.severity} {cve.score ?? '—'}</span>{cve.kev && <span className="badge critical">CISA KEV</span>}<span className="badge cyan">{cve.matchBasis === 'nvd_affected' ? 'Plage éditeur dans NVD' : cve.matchBasis === 'primary_advisory' ? 'Avis éditeur' : 'CPE NVD'}</span><span className="badge cyan">{cve.attackVector ?? 'Vecteur inconnu'}</span></div>
      </header>
      <p className="cve-description">{cve.description}</p>
      <div className="tabs compact-tabs" role="tablist" aria-label="Détails de la vulnérabilité">
        <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => onTab('summary')}>Fiche technique</button>
        <button type="button" role="tab" aria-selected={tab === 'attack'} onClick={() => onTab('attack')}>Comprendre le risque</button>
        <button type="button" role="tab" aria-selected={tab === 'evidence'} onClick={() => onTab('evidence')}>Remédiation & sources</button>
      </div>

      {tab === 'summary' && (
        <section className="tab-panel">
          <div className="fact-grid live-facts">
            <div><span>Faiblesse</span><strong>{cve.weaknesses.join(', ') || 'Non renseignée'}</strong></div>
            <div><span>Vecteur CVSS</span><strong>{cve.vector ?? 'Non renseigné'}</strong></div>
            <div><span>Privilèges requis</span><strong>{humanValue(cve.privilegesRequired)}</strong></div>
            <div><span>Interaction utilisateur</span><strong>{humanValue(cve.userInteraction)}</strong></div>
            <div><span>Confidentialité</span><strong>{impactLabel(cve.confidentialityImpact)}</strong></div>
            <div><span>Intégrité</span><strong>{impactLabel(cve.integrityImpact)}</strong></div>
          </div>
          {cve.kev && <div className="kev-action"><strong>Exploitation observée par la CISA</strong><p>{cve.kev.requiredAction}</p><span>Échéance fédérale : {cve.kev.dueDate} · rançongiciel : {cve.kev.knownRansomwareCampaignUse}</span></div>}
        </section>
      )}

      {tab === 'attack' && (
        <section className="tab-panel">
          <p className="section-label">Lecture défensive des conditions d’exploitation</p>
          <div className="attack-chain defensive-chain">
            <div className="attack-step"><span>01</span><h3>Surface</h3><p>Vecteur {humanValue(cve.attackVector)}. Vérifiez si le composant est exposé dans votre contexte.</p></div>
            <div className="attack-step"><span>02</span><h3>Privilèges</h3><p>L’exploitation demande des privilèges : {humanValue(cve.privilegesRequired)}.</p></div>
            <div className="attack-step"><span>03</span><h3>Interaction</h3><p>Interaction utilisateur : {humanValue(cve.userInteraction)}.</p></div>
            <div className="attack-step"><span>04</span><h3>Impact</h3><p>Disponibilité : {impactLabel(cve.availabilityImpact)} ; intégrité : {impactLabel(cve.integrityImpact)}.</p></div>
          </div>
          <p className="safety-note">Cette lecture explique les préconditions et les impacts sans fournir de charge d’exploitation.</p>
        </section>
      )}

      {tab === 'evidence' && (
        <section className="tab-panel">
          <p className="section-label">Avis, correctifs et preuves publiques</p>
          <div className="remediation-callout"><strong>Décision recommandée</strong><p>Confirmez la plage de versions affectées dans l’avis de l’éditeur, puis appliquez la version corrigée ou le contournement officiellement documenté.</p><a href={advisoryUrl} target="_blank" rel="noreferrer">Ouvrir le portail sécurité de l’éditeur ↗</a></div>
          <div className="reference-list">
            <a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noreferrer"><span>NVD / NIST</span><strong>Fiche officielle {cve.id} ↗</strong><em>Référence</em></a>
            {displayedRefs.map((reference) => <a href={reference.url} target="_blank" rel="noreferrer" key={reference.url}><span>{reference.source}</span><strong>{new URL(reference.url).hostname} ↗</strong><em>{reference.tags.join(' · ') || 'Source publique'}</em></a>)}
          </div>
        </section>
      )}
    </>
  );
}

function DeepPatchPanel({ cve, asset, productName, advisoryUrl }: { cve: Vulnerability; asset: InventoryAsset; productName: string; advisoryUrl: string }) {
  const fixRef = cve.references.find((reference) => reference.tags.some((tag) => ['Patch', 'Vendor Advisory', 'Mitigation'].includes(tag)));
  return <section className="deep-patch-panel" aria-labelledby="deep-patch-title">
    <header><div><span>REMÉDIATION GUIDÉE · {asset.label}</span><h3 id="deep-patch-title">Patch en profondeur</h3><p>{cve.id} · {productName} · version installée {asset.version || 'non précisée'}</p></div><strong data-severity={cve.severity}>{cve.severity} · {cve.score ?? '—'}</strong></header>
    <div className="deep-patch-grid"><article><b>01 · Confirmer</b><h4>Vérifier l’exposition</h4><p>Comparez la version installée, le rôle de l’équipement et son exposition avec l’avis éditeur. Une correspondance NVD ne remplace pas cette vérification.</p></article><article><b>02 · Choisir</b><h4>Version corrigée ou contournement</h4><p>{cve.kev ? `La CISA demande : ${cve.kev.requiredAction}` : 'Utilisez la version corrigée publiée par l’éditeur ou son contournement officiellement documenté.'}</p></article><article><b>03 · Préparer</b><h4>Réduire le risque pendant l’intervention</h4><p>Préparez une sauvegarde, une fenêtre de maintenance, un accès de secours et la rotation des secrets si l’avis le recommande.</p></article><article><b>04 · Valider</b><h4>Contrôler après mise à jour</h4><p>Vérifiez la version, les journaux, les services exposés et l’absence d’indicateur de compromission. Documentez la preuve de clôture.</p></article></div>
    <footer><span>Lecture défensive : {cve.attackVector ?? 'vecteur non renseigné'} · privilèges {cve.privilegesRequired ?? 'non renseignés'} · interaction {cve.userInteraction ?? 'non renseignée'}</span><div><a href={advisoryUrl} target="_blank" rel="noreferrer">Avis éditeur ↗</a>{fixRef ? <a href={fixRef.url} target="_blank" rel="noreferrer">Référence corrective ↗</a> : null}<a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noreferrer">Fiche NVD ↗</a></div></footer>
  </section>;
}
