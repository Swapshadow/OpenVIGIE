'use client';
import { useState } from 'react';
import { useDismiss } from './alerts-client';

type Props = { onEmail: () => void; onNotifications: () => void; onInventory: () => void; onTheme: () => void; onAbout: () => void; theme: 'dark' | 'light' };
export default function SettingsMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const items: [string, () => void][] = [['Alertes Email', props.onEmail], ['Notifications', props.onNotifications], ['Inventaire', props.onInventory], [`Thème : ${props.theme === 'dark' ? 'sombre → clair' : 'clair → sombre'}`, props.onTheme], ['À propos', props.onAbout]];
  return <div className="alerts-anchor" ref={ref}>
    <button type="button" className="icon-button" aria-label="Paramètres" aria-expanded={open} aria-controls="settings-menu" onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg></button>
    {open && <nav id="settings-menu" aria-label="Paramètres" className="alerts-popover settings-popover">{items.map(([label, action]) => <button type="button" key={label} onClick={() => { setOpen(false); action(); }}>{label}</button>)}</nav>}
  </div>;
}
