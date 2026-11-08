import { closeTop } from '../back';

/*
 * Keyboard shortcuts for playing on a computer. Every key just presses the same button a finger
 * would, so the game behaves exactly as it does on a phone.
 *
 *   Space        tap the station        1-5  open a menu tab
 *   B            Buy best               I    Install all
 *   O            Overdrive              M    Missions
 *   P            Profile                S    Settings
 *   Esc          close the top window
 */

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Tap the station'],
  ['1 – 5', 'Menu tabs'],
  ['B', 'Buy best'],
  ['I', 'Install all'],
  ['O', 'Overdrive'],
  ['M', 'Missions'],
  ['P', 'Profile'],
  ['S', 'Settings'],
  ['Esc', 'Close a window'],
];

/** Clicks a button if it is there, shown and enabled. */
function press(id: string): void {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  if (!el || el.hidden || el.disabled || el.offsetParent === null) return;
  el.click();
}

/** Labels that say which key does what, shown when the mouse rests on a button. */
const TITLES: Record<string, string> = {
  boost: 'Overdrive (O)',
  'best-buy': 'Buy best (B, hold to keep buying)',
  'install-all': 'Install all (I)',
  'missions-btn': 'Missions (M)',
  'profile-btn': 'Profile (P)',
  'settings-btn': 'Settings (S)',
};

export function setupKeys(opts: { tap: () => void; inTutorial: () => boolean }): void {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const [id, title] of Object.entries(TITLES)) document.getElementById(id)?.setAttribute('title', title);
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t, i) => t.setAttribute('title', `${t.textContent?.trim() ?? ''} (${i + 1})`));
    // A list of the keys in Settings, for people with a keyboard and mouse.
    const list = document.getElementById('keys-list');
    const box = document.getElementById('keys-box');
    if (list && box) {
      for (const [k, what] of SHORTCUTS) {
        const dt = document.createElement('dt');
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        dt.appendChild(kbd);
        const dd = document.createElement('dd');
        dd.textContent = what;
        list.append(dt, dd);
      }
      box.hidden = false;
    }
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
    if (e.key === 'Escape') {
      if (closeTop()) e.preventDefault();
      return;
    }
    const windowOpen = !!document.querySelector('.modal:not([hidden]), .sample-ad:not([hidden])');
    if (e.code === 'Space') {
      // Space on a focused button presses that button, as usual; elsewhere it taps the station.
      if (target && target.closest('button, [role="button"], a')) return;
      e.preventDefault();
      if (!e.repeat && !windowOpen) opts.tap();
      return;
    }
    if (e.repeat && e.key.toLowerCase() !== 'b') return;
    if (windowOpen || opts.inTutorial()) return;
    const key = e.key.toLowerCase();
    if (key >= '1' && key <= '5') {
      document.querySelectorAll<HTMLButtonElement>('.tab')[Number(key) - 1]?.click();
      return;
    }
    const ids: Record<string, string> = { b: 'best-buy', i: 'install-all', o: 'boost', m: 'missions-btn', p: 'profile-btn', s: 'settings-btn' };
    if (ids[key]) {
      e.preventDefault();
      press(ids[key]);
    }
  });
}
