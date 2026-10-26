/**
 * Touch gestures for the HTML UI: dragging the build panel up and down, and holding a buy
 * button to keep buying.
 */

const PANEL_KEY = 'scrap-orbit-panel';
/** Snap points as fractions of the space between the HUD and the bottom of the screen. */
const SNAPS = [0, 0.5, 0.82];

function load(): number | null {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

function store(v: number): void {
  try {
    localStorage.setItem(PANEL_KEY, String(v));
  } catch {
    // Storage can be blocked; the panel just won't remember its size.
  }
}

/**
 * Lets the player drag the panel by its handle or its tab bar. On release it snaps to
 * collapsed (tabs only), half, or tall, following the flick direction.
 */
export function makePanelDraggable(
  app: HTMLElement | null,
  panel: HTMLElement | null,
  handle: HTMLElement | null,
  tabs: HTMLElement | null,
  hud: HTMLElement | null,
): void {
  // Some hosts rewrite parts of the page; never let a missing element stop the game.
  if (!app || !panel || !handle || !tabs || !hud) return;
  // Collapsed still shows the handle and tab bar.
  const minH = () => handle.offsetHeight + tabs.offsetHeight + 8;
  const range = () => {
    const room = app.clientHeight - hud.offsetHeight - 120;
    return { min: minH(), max: Math.max(minH(), room) };
  };
  const heightFor = (f: number) => {
    const { min, max } = range();
    return min + (max - min) * f;
  };
  let fraction = load() ?? 0.5;
  // Set the row sizes directly: some web views mishandle var() fallbacks inside grid templates.
  const apply = (px: number) => (app.style.gridTemplateRows = `auto minmax(120px, 1fr) ${Math.round(px)}px`);
  const applyFraction = (animate: boolean) => {
    app.classList.toggle('snapping', animate);
    apply(heightFor(fraction));
    if (animate) setTimeout(() => app.classList.remove('snapping'), 260);
  };
  applyFraction(false);
  window.addEventListener('resize', () => applyFraction(false));

  let startY = 0;
  let startH = 0;
  let dragging = false;
  let pointer = -1;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  const down = (e: PointerEvent) => {
    if (pointer !== -1) return;
    pointer = e.pointerId;
    startY = lastY = e.clientY;
    lastT = performance.now();
    startH = panel.getBoundingClientRect().height;
    dragging = false;
    velocity = 0;
    // The handle is thin, so hold on to the pointer straight away. The tab bar waits for real
    // movement first, so taps still reach the tab buttons.
    if (e.currentTarget === handle) handle.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const dy = e.clientY - startY;
    // A small threshold keeps taps on the tabs working as taps.
    if (!dragging && Math.abs(dy) < 8) return;
    if (!dragging) {
      dragging = true;
      panel.classList.add('dragging');
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const now = performance.now();
    velocity = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY;
    lastT = now;
    const { min, max } = range();
    apply(Math.max(min, Math.min(max, startH - dy)));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    if (!dragging) {
      // A plain tap on the handle steps through the sizes, for screens where dragging is
      // taken over by the app around the game.
      if (e.currentTarget === handle) {
        fraction = fraction < 0.25 ? 0.5 : fraction < 0.7 ? SNAPS[SNAPS.length - 1] : 0;
        store(fraction);
        applyFraction(true);
      }
      return;
    }
    panel.classList.remove('dragging');
    const { min, max } = range();
    const current = (panel.getBoundingClientRect().height - min) / Math.max(1, max - min);
    // A quick flick goes to the next snap in that direction; otherwise the nearest one.
    if (velocity < -0.5) fraction = SNAPS.find((s) => s > current + 0.02) ?? SNAPS[SNAPS.length - 1];
    else if (velocity > 0.5) fraction = [...SNAPS].reverse().find((s) => s < current - 0.02) ?? SNAPS[0];
    else fraction = SNAPS.reduce((a, b) => (Math.abs(b - current) < Math.abs(a - current) ? b : a));
    store(fraction);
    applyFraction(true);
    // Swallow the click that ends a drag, so it doesn't also switch tabs.
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  };
  for (const el of [handle, tabs]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  // Keyboard: arrow keys on the handle step between sizes.
  handle.addEventListener('keydown', (e) => {
    const i = SNAPS.indexOf(fraction);
    if (e.key === 'ArrowUp' && i < SNAPS.length - 1) fraction = SNAPS[i + 1];
    else if (e.key === 'ArrowDown' && i > 0) fraction = SNAPS[i - 1];
    else return;
    e.preventDefault();
    store(fraction);
    applyFraction(true);
  });
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
