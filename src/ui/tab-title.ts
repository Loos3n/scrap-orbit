import type { Game } from '../game';
import * as eco from '../core/economy';
import { format } from '../core/num';

/*
 * The browser tab shows your scrap, so a computer player can watch it grow from another tab.
 * Browsers pause the game while its tab is hidden, so then the count is worked out the same way
 * the "welcome back" haul will be: income for the time away, up to the offline limit.
 */
export function setupTabTitle(game: Game): void {
  const base = 'Scrap Orbit';
  let hiddenSince = 0;
  let shown = '';
  const set = (t: string) => {
    if (t !== shown) document.title = shown = t;
  };
  const update = () => {
    const s = game.state;
    if (s.tutorial >= 0) return set(base);
    let scrap = s.scrap;
    if (document.visibilityState === 'hidden' && hiddenSince) {
      const away = (Date.now() - hiddenSince) / 1000;
      const seconds = Math.min(away, eco.offlineCapSec(s));
      if (away > 5) scrap = scrap.add(eco.baseIncome(s).mul(seconds).mul(eco.offlineMult(s)));
    }
    set(`${format(scrap, s.settings.numbers)} scrap · ${base}`);
  };
  document.addEventListener('visibilitychange', () => {
    hiddenSince = document.visibilityState === 'hidden' ? Date.now() : 0;
    update();
  });
  // Hidden tabs get timers about once a minute at most; that's plenty for a title.
  window.setInterval(update, 1000);
  update();
}
