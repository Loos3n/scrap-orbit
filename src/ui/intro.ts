import { sectorFor } from '../core/content';
import type { Game } from '../game';

/**
 * The title screen. It plays over the live station each time the game opens: the logo above
 * the station, a button below it, and the menus hidden until the captain taps in. The camera
 * frames the station between the two, then glides back to its usual spot as the menus return.
 * Anything that pops up at start-up (time-away earnings, the daily reward) waits underneath.
 */

const $ = (id: string) => document.getElementById(id)!;
const FADE_MS = 600;
const GLIDE_MS = 900;

export interface IntroHooks {
  /** Where the camera frames the station (the screen box it centres in). */
  focus(top: number, bottom: number, left: number, right: number): void;
  /** The camera is gliding back (true), or done and back to the band the menus leave free (false). */
  glide(on: boolean): void;
  /** The first tap: a little chime. */
  start(): void;
}

let showing = false;
/** True while the title screen is up (so the rest of the game can leave the camera alone). */
export const introShowing = () => showing;

/** The box the station sits in during the intro: between the logo and the button, full width. */
function band(): [number, number, number, number] {
  const h = window.innerHeight;
  const w = window.innerWidth;
  const top = $('intro').querySelector('.intro-top')!.getBoundingClientRect().bottom;
  const bottom = $('intro').querySelector('.intro-bottom')!.getBoundingClientRect().top;
  return bottom - top > h * 0.25 ? [top, bottom, 0, w] : [h * 0.3, h * 0.75, 0, w];
}

export function showIntro(game: Game, hooks: IntroHooks): void {
  const el = $('intro');
  const s = game.state;
  const fresh = s.tutorial >= 0 && s.stats.playSec < 30;
  $('intro-play').textContent = fresh ? 'Start salvaging' : 'Continue';
  const save = $('intro-save');
  save.hidden = fresh;
  if (!fresh) {
    const where = sectorFor(s.stats.relocations).name;
    const name = s.friends.name ? `${s.friends.name} · ` : '';
    save.textContent = `${name}${s.galaxy.shifts ? `Galaxy ${s.galaxy.shifts + 1} · ` : ''}${where}`;
  }
  showing = true;
  document.body.classList.add('intro');
  el.hidden = false;
  const frame = () => {
    if (showing) hooks.focus(...band());
  };
  requestAnimationFrame(frame);
  window.addEventListener('resize', frame);

  const go = () => {
    if (!showing) return;
    showing = false;
    window.removeEventListener('resize', frame);
    window.removeEventListener('keydown', key);
    hooks.start();
    el.classList.add('leaving');
    document.body.classList.remove('intro');
    // Glide the camera from the intro's framing back to the usual one.
    const [t0, b0, l0, r0] = band();
    hooks.glide(true);
    const stage = $('stage').getBoundingClientRect();
    const began = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - began) / GLIDE_MS);
      const e = 1 - Math.pow(1 - k, 3);
      if (k < 1) {
        hooks.focus(t0 + (stage.top - t0) * e, b0 + (stage.bottom - b0) * e, l0 + (stage.left - l0) * e, r0 + (stage.right - r0) * e);
        requestAnimationFrame(step);
      } else hooks.glide(false);
    };
    requestAnimationFrame(step);
    window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('leaving');
    }, FADE_MS);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      go();
    }
  };
  el.addEventListener('click', go);
  window.addEventListener('keydown', key);
}
