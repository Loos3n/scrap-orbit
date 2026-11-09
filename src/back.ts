import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/*
 * The Android back button. Without this the app closed itself from any screen; now back closes
 * whatever is open (a window, then the menu), and on the bare station it sends the game to the
 * background like the home button, so the station keeps its place.
 */

/** The button that closes each window, newest windows last in the page. */
const CLOSERS: Record<string, string> = {
  modal: 'modal-ok',
  settings: 'settings-close',
  info: 'info-close',
  safe: 'safe-close',
  trader: 'trader-close',
  profile: 'profile-close',
  missions: 'missions-close',
  streak: 'streak-claim',
  'cloud-ask': 'cloud-ask-close',
  radio: 'radio-close',
  festival: 'festival-close',
  fishing: 'fishing-close',
};

/** What back does right now: closes the top window or the menu. Returns false when nothing was open. */
export function closeTop(): boolean {
  const open = [...document.querySelectorAll<HTMLElement>('.modal:not([hidden])')];
  const top = open[open.length - 1];
  if (top) {
    // The contract choice waits for an answer, so back leaves it up.
    const closer = CLOSERS[top.id];
    if (closer) document.getElementById(closer)?.click();
    return true;
  }
  const menu = document.getElementById('menu-btn');
  if (menu?.getAttribute('aria-expanded') === 'true') {
    menu.click();
    return true;
  }
  return false;
}

export function setupBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    if (!closeTop()) void App.minimizeApp();
  }).catch(() => undefined);
}
