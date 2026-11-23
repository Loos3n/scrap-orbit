import type { GameState } from '../core/state';

/**
 * Settings, Comfort, on the page: a text size class (the stylesheet scales every font by --ts),
 * colour-blind colours and the left-handed mirror. The canvas minigames read the same classes.
 */
export function applyComfort(o: GameState['settings']): void {
  const body = document.body.classList;
  body.toggle('text-large', o.textSize === 'large');
  body.toggle('text-larger', o.textSize === 'larger');
  body.toggle('cb', o.colorBlind);
  body.toggle('lefty', o.leftHanded);
}

/** Whether colour-blind colours are on, for canvas drawing that can't use the stylesheet. */
export function colorBlindOn(): boolean {
  return document.body.classList.contains('cb');
}
