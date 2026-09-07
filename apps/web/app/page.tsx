'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Cadence } from './bulletin-data';
import InventoryWorkspace from './inventory-workspace';
import LeakToday from './leak-today';
import BulletinWorkspace from './bulletin-workspace';
import VigiChat from './vigi-chat';
import SettingsMenu from './settings-menu';
import EmailAlertsConfig from './email-alerts-config';
import NotificationCenter from './notification-center';

type View = 'bulletin' | 'leaks' | 'assets';
type Theme = 'dark' | 'light';

type IconName = View | 'radar' | 'notifications' | 'search' | 'sun' | 'moon';

const THEME_STORAGE_KEY = 'openvigie.theme';

function AppIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    bulletin: <><path d="M6.5 4.5h8.25A2.25 2.25 0 0 1 17 6.75v12.75H6.5A2.5 2.5 0 0 1 4 17V7a2.5 2.5 0 0 1 2.5-2.5Z" /><path d="M8 8h5M8 11.5h5M8 15h3.5M17 7h.5A2.5 2.5 0 0 1 20 9.5V17a2.5 2.5 0 0 1-2.5 2.5H17" /></>,
    leaks: <><path d="M12 3.5s5.25 5.75 5.25 10a5.25 5.25 0 0 1-10.5 0c0-4.25 5.25-10 5.25-10Z" /><path d="M9.5 14.25a2.5 2.5 0 0 0 2.5 2.5" /></>,
    assets: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M8 19v2M16 19v2M8.5 9.5h7M8.5 13h4.5" /><circle cx="17" cy="13" r="1" fill="currentColor" stroke="none" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5M10.5 8v5M8 10.5h5" /></>,
    radar: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 12 18.5 5.5" /></>,
    notifications: <><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.25 6.25 2.25 6.25H4.25S6.5 15.5 6.5 9.5Z" /><path d="M10 19.5h4" /></>,
    sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 3v2.2M12 18.8V21M4.4 12H6.6M17.4 12h2.2M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6" /></>,
    moon: <><path d="M20 14.3A8.5 8.5 0 1 1 9.7 4a6.7 6.7 0 0 0 10.3 10.3Z" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const [view, setView] = useState<View>('bulletin');
  const [settingsView, setSettingsView] = useState<'email' | 'about' | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigate = (next: View) => { setSettingsView(null); setView(next); };
  const [cadence] = useState<Cadence>('daily');
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') setTheme('light');
      } catch {
        // Storage may be unavailable in privacy mode.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Per-viewer convenience only — losing it just resets to dark next visit.
      }
      return next;
    });
  }, []);

  return (
    <main className="app-shell">
      <div className="sun" aria-hidden="true"><span /></div>
      <div className="horizon-grid" aria-hidden="true" />

      <header className="topbar glass-panel">
        <a className="brand" href="#main-content" aria-label="OpenVigie, aller au contenu">
          <span className="brand-mark"><AppIcon name="radar" /></span>
          <span><b>OPEN</b>VIGIE</span>
        </a>
        <div className="sync-state"><span aria-hidden="true" />CVE + sources éditoriales en direct</div>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
            title={theme === 'dark' ? 'Thème clair (blanc, rouge & or)' : 'Thème sombre'}
            onClick={toggleTheme}
          >
            <AppIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="icon-button" aria-label="Rechercher" onClick={() => navigate('bulletin')}><AppIcon name="search" /></button>
          <NotificationCenter open={notificationsOpen} onOpenChange={setNotificationsOpen} />
          <SettingsMenu theme={theme} onTheme={toggleTheme} onEmail={() => setSettingsView('email')} onNotifications={() => setNotificationsOpen(true)} onInventory={() => navigate('assets')} onAbout={() => setSettingsView('about')} />
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar glass-panel" aria-label="Navigation principale">
          <p className="eyebrow">Navigation</p>
          <nav className="nav-list">
            {[
              ['bulletin', 'Bulletin'],
              ['leaks', 'Fuites de données'],
              ['assets', 'Mon parc'],
            ].map(([id, label]) => (
              <button
                className="nav-item"
                type="button"
                aria-current={!settingsView && view === id ? 'page' : undefined}
                key={id}
                onClick={() => navigate(id as View)}
              >
                <span className="nav-icon"><AppIcon name={id as View} /></span><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="open-source-note">
            <strong>100 % open source</strong>
            <span>Pipeline auditable</span>
            <span>Sources traçables</span>
            <span>Contributions ouvertes</span>
          </div>
        </aside>

        {settingsView === 'email' ? <EmailAlertsConfig /> : settingsView === 'about' ? <section className="email-settings glass-panel"><h1>À propos d’OpenVigie</h1><p>Veille de vulnérabilités open source centrée sur votre parc d’équipements.</p><p>Licence AGPL-3.0. Confirmez les correspondances CVE dans les avis éditeurs.</p><a href="https://github.com/Swapshadow/openvigie" target="_blank" rel="noopener noreferrer">Code source et contributions ↗</a></section> : view === 'bulletin' ? (
          <BulletinWorkspace />
        ) : view === 'leaks' ? (
          <LeakToday />
        ) : (
          <InventoryWorkspace />
        )}
      </div>

      <VigiChat cadence={cadence} />
    </main>
  );
}
