'use client';
import { useEffect, useState } from 'react';
import { alertsRequest } from './alerts-client';

type Config = { provider: string; host: string; port: number; security: string; username: string; sender: string; enabled: boolean; password: string; has_password?: boolean };
type Recipient = { id: number; email: string };
const presets: Record<string, { host: string; port: number; security: string }> = {
  Gmail: { host: 'smtp.gmail.com', port: 465, security: 'ssl' },
  Proton: { host: 'smtp.protonmail.ch', port: 587, security: 'starttls' },
  Outlook: { host: 'smtp-mail.outlook.com', port: 587, security: 'starttls' },
  Personnalisé: { host: '', port: 587, security: 'starttls' },
};
export default function EmailAlertsConfig() {
  const [config, setConfig] = useState<Config>({ provider: 'Gmail', ...presets.Gmail, username: '', sender: '', enabled: false, password: '' });
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [email, setEmail] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    try {
      setError('');
      const [settings, list] = await Promise.all([alertsRequest<{ config: Config; secret_key_configured: boolean }>('settings/email-config'), alertsRequest<{ recipients: Recipient[] }>('settings/email-recipients')]);
      if (settings.config) setConfig({ ...settings.config, enabled: Boolean(settings.config.enabled), password: '' });
      setKeyReady(settings.secret_key_configured); setRecipients(list.recipients); setReady(true);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const change = (key: keyof Config, value: string | number | boolean) => setConfig(c => ({ ...c, [key]: value }));
  return <section className="email-settings glass-panel" aria-labelledby="email-heading">
    <h1 id="email-heading">Alertes Email</h1><p>Recevez les nouvelles CVE détectées pour les produits et versions de votre parc.</p>
    {error && <p role="alert" className="alerts-error">{error}</p>}{message && <p role="status">{message}</p>}
    {!ready ? <button onClick={() => void load()}>Charger la configuration</button> : <>
      {!keyReady && <p role="alert">Définissez OPENVIGIE_SECRET_KEY dans l’environnement du collecteur (au moins 32 caractères aléatoires), puis redémarrez-le pour configurer SMTP.</p>}
      <form onSubmit={e => { e.preventDefault(); void action(async () => { const data = await alertsRequest<{ config: Config; secret_key_configured: boolean }>('settings/email-config', 'POST', config); setConfig({ ...data.config, enabled: Boolean(data.config.enabled), password: '' }); setMessage('Configuration enregistrée. Le mot de passe est chiffré.'); }); }}>
        <fieldset disabled={busy || !keyReady}><legend>Serveur SMTP</legend>
          <label>Fournisseur<select value={config.provider} onChange={e => setConfig(c => ({ ...c, provider: e.target.value, ...presets[e.target.value], password: '', has_password: false }))}>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}</select></label>
          <p className="alerts-help">Gmail : mot de passe d’application. Proton : jeton SMTP d’une offre éligible. Outlook.com exige OAuth2 : utilisez un relais SMTP compatible pour ces comptes (OAuth2 non pris en charge). Personnalisé : serveur compatible TLS et authentification SMTP.</p>
          <div className="smtp-grid">
            <label>Serveur<input required maxLength={254} value={config.host} onChange={e => change('host', e.target.value)} /></label>
            <label>Port<input required type="number" min={1} max={65535} value={config.port} onChange={e => change('port', Number(e.target.value))} /></label>
            <label>Chiffrement<select value={config.security} onChange={e => change('security', e.target.value)}><option value="ssl">TLS implicite</option><option value="starttls">STARTTLS</option></select></label>
            <label>Identifiant<input required autoComplete="username" value={config.username} onChange={e => change('username', e.target.value)} /></label>
            <label>Adresse expéditrice<input required type="email" value={config.sender} onChange={e => change('sender', e.target.value)} /></label>
            <label>Mot de passe SMTP<input type="password" autoComplete="new-password" required={!config.has_password} value={config.password} placeholder={config.has_password ? 'Enregistré — laisser vide pour conserver' : 'Mot de passe ou jeton SMTP'} onChange={e => change('password', e.target.value)} /></label>
          </div>
          <label className="alerts-checkbox"><input type="checkbox" checked={config.enabled} onChange={e => change('enabled', e.target.checked)} />Activer les emails pour les notifications en attente</label>
          <div className="alerts-buttons"><button type="submit">Enregistrer</button><button type="button" onClick={() => void action(async () => { const result = await alertsRequest<{ message: string }>('settings/email-config/test', 'POST', config); setMessage(result.message); })}>Tester la connexion</button></div>
        </fieldset>
      </form>
      <h2>Destinataires</h2><p>Chaque destinataire reçoit un email individuel.</p>
      <form onSubmit={e => { e.preventDefault(); void action(async () => { const result = await alertsRequest<{ recipients: Recipient[] }>('settings/email-recipients', editId === null ? 'POST' : 'PUT', { email, id: editId }); setRecipients(result.recipients); setEmail(''); setEditId(null); }); }}>
        <fieldset disabled={busy}><label>Adresse email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><button type="submit">{editId === null ? 'Ajouter' : 'Enregistrer le destinataire'}</button>{editId !== null && <button type="button" onClick={() => { setEditId(null); setEmail(''); }}>Annuler</button>}</fieldset>
      </form>
      {recipients.length === 0 && <p>Aucun destinataire : aucun email ne sera envoyé.</p>}
      <ul className="recipient-list">{recipients.map(r => <li key={r.id}><span>{r.email}</span><button disabled={busy} onClick={() => { setEmail(r.email); setEditId(r.id); }}>Modifier</button><button disabled={busy} onClick={() => void action(async () => { const result = await alertsRequest<{ recipients: Recipient[] }>('settings/email-recipients', 'DELETE', { id: r.id }); setRecipients(result.recipients); if (editId === r.id) { setEditId(null); setEmail(''); } })}>Supprimer</button></li>)}</ul>
    </>}
  </section>;
}
