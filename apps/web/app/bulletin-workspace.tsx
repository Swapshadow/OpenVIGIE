'use client';
import { useWorkspaceDesk, type Desk } from './workspace-navigation';
import BulletinUnified from './bulletin-unified';
import CertFrPanel from './cert-fr-panel';
import WeeklyReport from './weekly-report';
import DeepSearch from './deep-search';

const DESKS: Record<Desk, { label: string; hint: string }> = {
  fil: { label: 'Votre veille, en perspective.', hint: 'Repérez les menaces, suivez les correctifs et gardez une longueur d’avance.' },
  certfr: { label: 'Les alertes de référence.', hint: 'Retrouvez les alertes et les avis officiels de l’ANSSI.' },
  hebdo: { label: 'Une semaine. L’essentiel.', hint: 'Prenez du recul sur les sept derniers jours et exportez votre synthèse.' },
  recherche: { label: 'Explorez les signaux.', hint: 'Recherchez un produit, une vulnérabilité ou un sujet dans les archives.' },
};

export default function BulletinWorkspace() {
  const desk = useWorkspaceDesk();
  const active = DESKS[desk];
  return (
    <section className="content bulletin-workspace" id="main-content">
      <header className="bw-masthead">
        <div className="bw-dateline"><span>OPENVIGIE / INTELLIGENCE</span><span suppressHydrationWarning>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}</span></div>
        <h1>{active.label}</h1>
        <p className="bw-standfirst">{active.hint}</p>
        <div className="mission-radar" aria-hidden="true"><span /><i /><b /></div>
      </header>
      <div className="bw-body">
        {desk === 'fil' ? <BulletinUnified /> : desk === 'certfr' ? <CertFrPanel /> : desk === 'hebdo' ? <WeeklyReport /> : <DeepSearch />}
      </div>
    </section>
  );
}
