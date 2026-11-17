'use client';

import { PointerEvent, useMemo, useState } from 'react';
import type { InventoryAsset } from './vulnerability-types';

const glyphs: Record<InventoryAsset['kind'], string> = {
  server: '▤', workstation: '▣', switch: '⇄', router: '⌁', firewall: '⬡', phone: '▯', cloud: '☁', service: '◆',
};
const labels: Record<InventoryAsset['kind'], string> = {
  server: 'Serveur', workstation: 'Poste', switch: 'Commutateur', router: 'Routeur', firewall: 'Pare-feu', phone: 'Téléphone', cloud: 'Cloud', service: 'Service',
};

export default function InfrastructureMap({ assets, selectedId, onSelect }: { assets: InventoryAsset[]; selectedId: string; onSelect: (id: string) => void }) {
  const [rotation, setRotation] = useState({ x: -12, y: -18 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const nodes = useMemo(() => assets.map((asset, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(assets.length, 1) - Math.PI / 2;
    const ring = 145 + (index % 3) * 24;
    return { asset, x: Math.cos(angle) * ring, z: Math.sin(angle) * ring, y: ((index % 4) - 1.5) * 42 };
  }), [assets]);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    setRotation((value) => ({ x: Math.max(-55, Math.min(25, value.x - (event.clientY - drag.y) * .25)), y: value.y + (event.clientX - drag.x) * .35 }));
    setDrag({ x: event.clientX, y: event.clientY });
  }

  return (
    <section className="si-map glass-panel" aria-labelledby="si-map-title">
      <header><div><p className="eyebrow neon">Cartographie organisationnelle</p><h2 id="si-map-title">Topologie 3D du SI</h2></div><span>{assets.length} équipement{assets.length > 1 ? 's' : ''}</span></header>
      <div className="si-map-stage" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY }); }} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <div className="si-map-world" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}>
          <div className="si-map-grid" />
          <div className="si-core"><b>OV</b><span>Organisation</span></div>
          {nodes.map(({ asset, x, y, z }) => <button key={asset.id} type="button" className={`si-node ${selectedId === asset.id ? 'active' : ''}`} style={{ transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${-rotation.y}deg) rotateX(${-rotation.x}deg)` }} onClick={(event) => { event.stopPropagation(); onSelect(asset.id); }} aria-label={`${labels[asset.kind]} ${asset.label}`}>
            <i>{glyphs[asset.kind]}</i><b>{asset.label}</b><span>{labels[asset.kind]} · {asset.version}</span>
          </button>)}
        </div>
        {!assets.length ? <p className="si-map-empty">Ajoutez un équipement pour construire la topologie de votre organisation.</p> : null}
        <p className="si-map-help">Faire glisser pour pivoter · sélectionner un nœud pour l’analyser</p>
      </div>
      <div className="si-map-legend">{Object.entries(labels).map(([kind, label]) => <span key={kind}><i>{glyphs[kind as InventoryAsset['kind']]}</i>{label}</span>)}</div>
    </section>
  );
}
