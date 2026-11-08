/*
 * Day and night on the station, following the player's own clock. Late at night the station
 * dims, windows glow, the crew dozes and the music slows; at dawn and dusk the light turns warm.
 * It is mostly for looks: the one game effect is that shooting stars come by more often at night
 * (the station scene runs its shooting-star timer faster).
 */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface Daylight {
  /** 0 in full day, 1 in the middle of the night. */
  night: number;
  /** How golden the light is: peaks at sunrise and sunset, 0 the rest of the time. */
  warm: number;
  phase: DayPhase;
}

/** Hours (local, fractional) where each change starts and ends. */
const DAWN = [5.5, 8] as const;
const DUSK = [18.5, 21] as const;

/** Smooth 0..1 between a and b. */
function ease(x: number, a: number, b: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A bump that is 1 at the middle of [a, b] and 0 at its ends. */
function bump(x: number, a: number, b: number): number {
  if (x <= a || x >= b) return 0;
  return Math.sin(((x - a) / (b - a)) * Math.PI);
}

/** The light for a local hour of the day (0 to 24, fractions allowed). */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24;
  const night = h < 12 ? 1 - ease(h, DAWN[0], DAWN[1]) : ease(h, DUSK[0], DUSK[1]);
  const warm = h < 12 ? bump(h, DAWN[0] - 0.5, DAWN[1] + 0.5) : bump(h, DUSK[0] - 1, DUSK[1]);
  const phase: DayPhase = night > 0.85 ? 'night' : night < 0.15 ? 'day' : h < 12 ? 'dawn' : 'dusk';
  return { night, warm, phase };
}

/** The light right now on this device's clock. */
export function daylight(now: number): Daylight {
  const d = new Date(now);
  return daylightAt(d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600);
}

/** How much more often shooting stars come by at night. */
export function nightStarRate(night: number): number {
  return 1 + night;
}

/** What the crew say when the light changes; shown once per change as a toast. */
export const PHASE_LINES: Record<DayPhase, string> = {
  dawn: '<b>Good morning!</b> The sun is coming up over the station.',
  day: '<b>Morning shift is on.</b> Everyone is up and the machines are humming.',
  dusk: '<b>Sunset.</b> The crew are switching on the window lights.',
  night: '<b>Night shift.</b> The crew have turned in. Shooting stars come by more often now.',
};
