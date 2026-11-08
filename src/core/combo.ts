/*
 * Combo tapping: quick taps build heat, and heat multiplies what each tap is worth (up to 3x).
 * Heat holds for a moment after the last tap, then cools. It lives only in memory, never in the save.
 */

export const COMBO = {
  /** Heat each tap adds (0 to 1); about 15 quick taps reach the top. */
  perTap: 0.07,
  /** Seconds heat holds after a tap before it starts to cool. */
  holdSec: 0.35,
  /** Heat lost per second once cooling: a full meter empties in about a second. */
  coolPerSec: 1.1,
  /** Tap multiplier at full heat. */
  maxMult: 3,
};

/** Heat left `sinceSec` seconds after the last tap. */
export function cooled(heat: number, sinceSec: number): number {
  if (sinceSec <= COMBO.holdSec) return heat;
  return Math.max(0, heat - (sinceSec - COMBO.holdSec) * COMBO.coolPerSec);
}

/** Heat after a tap that lands `sinceSec` seconds after the one before. */
export function heatAfterTap(heat: number, sinceSec: number): number {
  return Math.min(1, cooled(heat, sinceSec) + COMBO.perTap);
}

/** What a tap is worth at this heat, as a multiplier. */
export function comboMult(heat: number): number {
  return 1 + Math.max(0, Math.min(1, heat)) * (COMBO.maxMult - 1);
}
