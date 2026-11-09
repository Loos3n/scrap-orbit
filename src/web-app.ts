import { Capacitor } from '@capacitor/core';

/**
 * The web version as an installable app: the service worker (sw/sw.js, written by the build) so
 * it starts without internet, and the "Install the game" box in Settings.
 */

/** Chrome, Edge and Android browsers hand this over when the game can be installed. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const native = () => Capacitor.isNativePlatform();

/** Already running as an installed app (its own window, no browser bars). */
export function runningInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad Safari can only install by hand, from the Share menu. */
function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Only the real website gets the service worker: not the phone app, the one-file playable, or file:// copies. */
function canUseServiceWorker(): boolean {
  if (native() || import.meta.env.MODE === 'single' || import.meta.env.DEV) return false;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
  // Inside someone else's page (an embed), leave caching to the host.
  try {
    if (window.top !== window.self) return false;
  } catch {
    return false;
  }
  return true;
}

export function registerServiceWorker(): void {
  if (!canUseServiceWorker()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline mode unavailable', err));
  });
}

/** Shows the install box in Settings when this browser can install the game. */
export function setupInstall(toast: (text: string) => void): void {
  const box = document.getElementById('install-box');
  const btn = document.getElementById('install-btn') as HTMLButtonElement | null;
  const text = document.getElementById('install-text');
  if (!box || !btn || !text || native() || runningInstalled() || !canUseServiceWorker()) return;
  let prompt: InstallPrompt | null = null;
  if (isAppleMobile()) {
    // Safari has no install button for pages to use; explain the two taps instead.
    text.textContent = 'Tap the Share button in Safari, then "Add to Home Screen". The game opens full screen and plays without internet.';
    btn.hidden = true;
    box.hidden = false;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    btn.hidden = false;
    box.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!prompt) return;
    const p = prompt;
    prompt = null;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') box.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    box.hidden = true;
    toast('Scrap Orbit is installed. Open it from your home screen or desktop.');
  });
}
