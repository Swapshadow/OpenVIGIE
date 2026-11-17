'use client';

import { FormEvent, useState } from 'react';
import CyberBackground from './cyber-background';
import LighthouseMark from './lighthouse-mark';

export type Account = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  organization: { id: string; name: string; slug: string };
};

export function AccountAccess({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json() as { account?: Account; error?: string };
      if (!response.ok || !payload.account) throw new Error(payload.error ?? 'Connexion impossible.');
      onAuthenticated(payload.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-shell">
      <CyberBackground />
      <section className="access-story">
        <p className="eyebrow neon">OpenVigie 2027</p>
        <h1>La vigie cyber<br />centrée sur votre SI.</h1>
        <p>Corrélations NVD vérifiables, cartographie du parc et rapports isolés par organisation.</p>
        <ul>
          <li><b>NIST NVD</b><span>CPE et plages de versions, sans recherche approximative.</span></li>
          <li><b>Organisation isolée</b><span>Chaque parc possède ses équipements et ses rapports.</span></li>
          <li><b>Données locales</b><span>Déploiement Docker et intelligence locale.</span></li>
        </ul>
      </section>
      <section className="access-card glass-panel" aria-labelledby="access-title">
        <div className="access-brand"><span><LighthouseMark /></span><div><b>openvigie</b><small>CYBER INTELLIGENCE</small></div></div>
        <h2 id="access-title">{mode === 'register' ? 'Créer votre espace sécurisé' : 'Retrouver votre espace'}</h2>
        <p>{mode === 'register' ? 'Le premier compte devient propriétaire de son organisation.' : 'Connectez-vous à votre organisation.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' ? <>
            <label><span>Votre nom</span><input name="displayName" autoComplete="name" required maxLength={100} /></label>
            <label><span>Organisation</span><input name="organizationName" autoComplete="organization" required maxLength={120} /></label>
          </> : null}
          <label><span>Email professionnel</span><input name="email" type="email" autoComplete="email" required /></label>
          <label><span>Mot de passe</span><input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={12} required /></label>
          {error ? <p className="access-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Vérification…' : mode === 'register' ? 'Créer mon organisation' : 'Se connecter'}</button>
        </form>
        <button className="access-switch" type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>
          {mode === 'register' ? 'J’ai déjà un compte' : 'Créer une organisation'}
        </button>
        <small className="access-note">Mot de passe dérivé avec scrypt · session sécurisée HttpOnly · aucune donnée d’exemple injectée.</small>
      </section>
    </main>
  );
}
