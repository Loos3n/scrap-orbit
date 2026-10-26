/**
 * Touch helpers for the HTML UI: sizing the bottom panel, and holding a buy button to keep
 * buying.
 */

const PANEL_KEY = 'scrap-orbit-panel';
export type PanelSize = 'closed' | 'half' | 'tall';
/** Open heights as fractions of the space between the HUD and the bottom of the screen. */
const OPEN: Record<Exclude<PanelSize, 'closed'>, number> = { half: 0.5, tall: 0.82 };

function load(): PanelSize {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    return raw === 'closed' || raw === 'tall' ? raw : 'half';
  } catch {
    return 'half';
  }
}

function store(v: PanelSize): void {
  try {
    localStorage.setItem(PANEL_KEY, v);
  } catch {
    // Storage can be blocked; the panel just won't remember its size.
  }
}

export interface PanelSizer {
  readonly size: PanelSize;
  /** The size to reopen at: whichever open size was used last. */
  readonly lastOpen: PanelSize;
  set(size: PanelSize): void;
}

/**
 * Sizes the panel with taps only, no dragging: the tab bar sits at the bottom like an app's
 * menu bar. The panel is closed (tab bar only), half or tall. Dragging was dropped because the
 * apps that host the game grab vertical swipes for themselves.
 */
export function makePanelSizer(app: HTMLElement, tabs: HTMLElement, hud: HTMLElement, head: HTMLElement): PanelSizer {
  let size = load();
  let lastOpen: PanelSize = size === 'tall' ? 'tall' : 'half';
  const heightFor = (s: PanelSize) => {
    const min = tabs.offsetHeight + 2;
    if (s === 'closed') return min;
    const max = Math.max(min, app.clientHeight - hud.offsetHeight - 120);
    return min + head.offsetHeight + (max - min - head.offsetHeight) * OPEN[s];
  };
  // Set the row sizes directly: some web views mishandle var() fallbacks inside grid templates.
  const apply = (animate: boolean) => {
    app.classList.toggle('snapping', animate);
    app.classList.toggle('panel-closed', size === 'closed');
    app.dataset.panel = size;
    app.style.gridTemplateRows = `auto minmax(120px, 1fr) ${Math.round(heightFor(size))}px`;
    if (animate) setTimeout(() => app.classList.remove('snapping'), 260);
  };
  apply(false);
  window.addEventListener('resize', () => apply(false));
  return {
    get size() {
      return size;
    },
    get lastOpen() {
      return lastOpen;
    },
    set(next: PanelSize) {
      if (next === size) return;
      size = next;
      if (size !== 'closed') lastOpen = size;
      store(size);
      apply(true);
    },
  };
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
