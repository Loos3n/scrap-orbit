/**
 * Touch helpers for the HTML UI: opening and hiding the bottom panel, and holding a buy button to keep
 * buying.
 */

const PANEL_KEY = 'scrap-orbit-panel';
/** The open menu's height, as a fraction of the screen. */
const OPEN = 0.5;

function loadOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function storeOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage can be blocked; the panel just won't remember whether it was open.
  }
}

export interface PanelToggle {
  readonly open: boolean;
  set(open: boolean): void;
}

/**
 * The menu is either hidden, leaving just a small square button over the station, or open edge
 * to edge across the bottom half of the screen with its tabs along the top. The square toggles it
 * and rides along on the right of the tab row. No dragging: the apps that host the game grab
 * vertical swipes.
 */
export function makePanelToggle(app: HTMLElement, tabs: HTMLElement, hud: HTMLElement, button: HTMLElement): PanelToggle {
  let open = loadOpen();
  const height = () => (open ? Math.max(tabs.offsetHeight + 160, Math.min(app.clientHeight * OPEN, app.clientHeight - hud.offsetHeight - 120)) : 0);
  // Set the row sizes directly: some web views mishandle var() fallbacks inside grid templates.
  const apply = (animate: boolean) => {
    app.classList.toggle('snapping', animate);
    app.classList.toggle('panel-closed', !open);
    const h = Math.round(height());
    app.style.gridTemplateRows = `auto minmax(120px, 1fr) ${h}px`;
    // Open, the square sits at the right end of the tab row; closed, in the bottom corner.
    button.style.bottom = open ? `${Math.round(h - tabs.offsetHeight + (tabs.offsetHeight - button.offsetHeight) / 2)}px` : '';
    button.setAttribute('aria-expanded', String(open));
    if (animate) setTimeout(() => app.classList.remove('snapping'), 260);
  };
  apply(false);
  window.addEventListener('resize', () => apply(false));
  return {
    get open() {
      return open;
    },
    set(next: boolean) {
      if (next === open) return;
      open = next;
      storeOpen(open);
      apply(true);
    },
  };
}

/**
 * For panels that redraw on a timer: reports when a finger is down on `el`, so the redraw can
 * wait. Replacing a button between press and release would swallow the tap.
 */
export function pressWatch(el: HTMLElement): () => boolean {
  let down = false;
  el.addEventListener('pointerdown', () => (down = true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, () => setTimeout(() => (down = false), 0));
  return () => down;
}

/**
 * Press once to act once; hold to repeat, starting after a short pause and speeding up.
 * The click that follows a hold is swallowed so it doesn't buy one extra.
 */
export function holdToRepeat(btn: HTMLButtonElement, action: () => void): void {
  const HOLD_MS = 350;
  let timer = 0;
  let held = false;
  let since = 0;
  let last = 0;
  let owed = 0;
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
    btn.classList.remove('holding');
  };
  // Buys per second: 8 at first, ramping to 20 over about two seconds. Counting by elapsed
  // time keeps the pace steady even when a slow phone delays the timer.
  const rate = (heldMs: number) => Math.min(20, 8 + heldMs / 160);
  const tick = () => {
    const now = performance.now();
    owed += ((now - last) / 1000) * rate(now - since);
    last = now;
    for (let i = 0; i < Math.min(5, Math.floor(owed)); i++) {
      if (btn.disabled) return stop();
      action();
    }
    owed -= Math.floor(owed);
    timer = window.setTimeout(tick, 40);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    held = false;
    stop();
    timer = window.setTimeout(() => {
      held = true;
      btn.classList.add('holding');
      since = last = performance.now();
      owed = 1;
      tick();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) btn.addEventListener(ev, stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    if (held) {
      held = false;
      e.preventDefault();
      return;
    }
    action();
  });
}
