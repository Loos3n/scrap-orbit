import * as planet from '../core/planet';
import { PLANET, PLANET_ERAS, PLANET_PATHS, type PlanetEra } from '../core/planet';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { planetPortrait, type PlanetLook } from '../scene/planet-art';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** What the scene and the window draw for the current save. */
export function planetLook(game: Game): PlanetLook | null {
  const p = game.state.planet;
  if (!p.found) return null;
  const settlers = PLANET_ERAS.findIndex((e) => e.id === 'settlers');
  const lights = p.era < settlers ? 0 : p.era === settlers ? 0.15 + p.project * 0.15 : 1;
  return { era: p.era, path: p.path, lights };
}

/**
 * The living planet's window (core/planet.ts): a picture of it, its name and era, the project
 * being worked on with a Send pod button (or how long until it takes hold), the path choice at
 * the seas, what it gives, and its stories. A story that is waiting opens as a card of its own.
 */
export class PlanetPanel {
  private key = '';
  private reading: { era: PlanetEra; fresh: boolean } | null = null;
  private naming = false;
  private pic = { key: '', url: '' };

  constructor(
    private game: Game,
    private fmt: (d: Decimal) => string,
    private hooks: { pod: () => void },
  ) {
    $('planet-btn').addEventListener('click', () => this.open());
    // The playable test build can skip the waiting: fill the project, or let it take hold now.
    $('opt-planet-row').hidden = import.meta.env.MODE !== 'single' && !import.meta.env.DEV;
    $('opt-planet-test').addEventListener('click', () => {
      const s = this.game.state;
      const p = s.planet;
      if (!p.found) planet.findPlanet(s, Date.now());
      else if (planet.needsPath(s)) {
        // The choice is the captain's: just open the window on it.
      } else if (p.settleAt) p.settleAt = Date.now();
      else {
        const pr = planet.currentProject(s);
        if (pr) {
          while (planet.canSendPod(s)) planet.landPod(s, Date.now());
        } else if (p.era === PLANET_ERAS.length - 1) p.shuttleAt = 0;
      }
      $('settings').hidden = true;
      this.open();
    });
    $('planet-close').addEventListener('click', () => this.close());
    $('planet').addEventListener('click', (e) => {
      if (e.target === $('planet')) return this.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-p]');
      if (!btn) return;
      const act = btn.dataset.p!;
      if (act === 'pod') {
        if (this.game.sendPod()) this.hooks.pod();
      } else if (act === 'path') this.game.choosePlanetPath(btn.dataset.id as planet.PlanetPath);
      else if (act === 'story') {
        const era = planet.pendingStory(this.game.state);
        if (era) this.reading = { era, fresh: true };
      } else if (act === 'replay') {
        const era = PLANET_ERAS.find((x) => x.id === btn.dataset.id);
        if (era) this.reading = { era, fresh: false };
      } else if (act === 'heard') {
        if (this.reading?.fresh) this.game.hearPlanetStory();
        this.reading = null;
      } else if (act === 'rename') this.naming = true;
      else if (act === 'save-name') {
        this.game.renamePlanet(($('planet-name-input') as HTMLInputElement).value);
        this.naming = false;
      }
      this.key = '';
      this.render();
    });
    $('planet').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).id === 'planet-name-input') {
        this.game.renamePlanet((e.target as HTMLInputElement).value);
        this.naming = false;
        this.key = '';
        this.render();
      }
    });
  }

  get isOpen(): boolean {
    return !$('planet').hidden;
  }

  open(story = false): void {
    $('planet').hidden = false;
    this.naming = false;
    this.reading = null;
    if (story) {
      const era = planet.pendingStory(this.game.state);
      if (era) this.reading = { era, fresh: true };
    }
    this.key = '';
    this.render();
  }

  close(): void {
    $('planet').hidden = true;
    this.reading = null;
    this.naming = false;
  }

  /** Whether something is waiting for the captain: a story, a path to pick, or a pod they can afford. */
  get wants(): boolean {
    const s = this.game.state;
    if (!s.planet.found) return false;
    return !!planet.pendingStory(s) || planet.needsPath(s) || this.game.canAffordPod();
  }

  /** The side button, its dot, and the window if it is open. */
  render(): void {
    const s = this.game.state;
    const p = s.planet;
    const now = Date.now();
    $('planet-btn').hidden = !p.found;
    if (!p.found) return;
    $('planet-dot').hidden = !this.wants;
    if ($('planet-btn-name').textContent !== p.name) $('planet-btn-name').textContent = p.name;
    if ($('planet').hidden) return;
    const cost = this.game.planetPodCost();
    const key = [p.era, p.project, p.loads, p.path, p.name, p.stories, p.settleAt, this.naming, this.reading?.era.id ?? '', ...(this.naming || this.reading ? [] : [Math.floor(now / 1000), this.game.canAffordPod(), cost ? this.fmt(cost.scrap) : ''])].join('|');
    if (key === this.key) return;
    this.key = key;
    if (this.reading) return this.renderStory(this.reading.era);
    this.renderPlanet(now);
  }

  private portrait(): string {
    const look = planetLook(this.game);
    if (!look) return '';
    const k = `${look.era}|${look.path}|${look.lights}`;
    if (this.pic.key !== k) this.pic = { key: k, url: planetPortrait(look, 200) };
    return this.pic.url;
  }

  private renderPlanet(now: number): void {
    const s = this.game.state;
    const p = s.planet;
    const era = planet.planetEra(s);
    const last = p.era === PLANET_ERAS.length - 1;
    const pr = planet.currentProject(s);
    const story = planet.pendingStory(s);
    const pct = Math.round((planet.planetMult(s) - 1) * 100);
    const path = PLANET_PATHS.find((x) => x.id === p.path);
    const nameRow = this.naming
      ? `<div class="whale-naming"><input id="planet-name-input" type="text" maxlength="14" value="${esc(p.name)}" aria-label="Planet's name" autocomplete="off" /><button type="button" class="primary" data-p="save-name">Save</button></div>`
      : `<h2 class="whale-name">${esc(p.name)} <button type="button" class="whale-rename" data-p="rename">Rename</button></h2>`;
    const steps = PLANET_ERAS.map((e, k) => `<i class="${k < p.era ? 'done' : k === p.era ? 'now' : ''}" title="${esc(e.name)}"></i>`).join('');

    let work = '';
    if (planet.needsPath(s)) {
      work = `<h3 class="section-title">What grows first?</h3>
        <p class="whale-lede">This sets how ${esc(p.name)} looks for good, and what it gives the station.</p>
        <div class="planet-paths">${PLANET_PATHS.map((x) => `<button type="button" data-p="path" data-id="${x.id}" style="--pc:${x.color}"><b>${esc(x.name)}</b><span>${esc(x.blurb)}</span><small>${esc(x.gives)}</small></button>`).join('')}</div>`;
    } else if (pr) {
      const settling = planet.settleSeconds(s, now);
      const pods = Array.from({ length: pr.loads }, (_, k) => `<i class="${k < p.loads ? 'on' : ''}"></i>`).join('');
      const name = planet.pathText(s, pr.name);
      const can = this.game.canAffordPod();
      const c = this.game.planetPodCost();
      const price = c ? (c.crystals ? `<span>${ICONS.crystal}</span><span class="n">${c.crystals}</span>` : `<span>${ICONS.scrap}</span><span class="n">${this.fmt(c.scrap)}</span>`) : '';
      work = `<div class="planet-project">
          <div class="planet-project-head"><span class="whale-chip planet-chip">Project ${p.project + 1} of ${era.projects.length}</span><span class="planet-pods">${pods}</span></div>
          <b>${esc(name)}</b>
          <p>${esc(planet.pathText(s, pr.desc))}</p>
          ${
            p.settleAt
              ? `<div class="planet-settle">${ICONS.clock}<span>${settling > 0 ? `Taking hold. Done in <b>${formatDuration(settling)}</b>` : 'Almost there...'}</span></div>`
              : `<button type="button" class="buy planet-send" data-p="pod" ${can ? '' : 'disabled'}><span class="buy-count">Send a pod <small>${p.loads} of ${pr.loads} landed</small></span><span class="buy-cost">${price}</span></button>`
          }
        </div>`;
    } else if (last) {
      const pop = planet.population(s, now);
      const next = Math.max(0, (p.shuttleAt - now) / 1000);
      work = `<div class="planet-project thriving">
          <b>${pop.toLocaleString()} people live here</b>
          <p>Trade shuttles rise from the spaceport every half hour or so with ${PLANET.shuttleMinutes} minutes of scrap. ${p.shuttles ? `${p.shuttles} so far.` : ''}</p>
          <div class="planet-settle">${ICONS.clock}<span>Next shuttle in <b>${formatDuration(next)}</b></span></div>
        </div>`;
    }

    const heard = PLANET_ERAS.slice(0, Math.min(p.stories, p.era + 1));
    $('planet-body').innerHTML = `
      <div class="planet-hero"><img src="${this.portrait()}" alt="" /></div>
      ${nameRow}
      <div class="whale-stage"><span class="whale-chip planet-chip">${esc(era.name)}</span><span class="whale-next">Era ${p.era + 1} of ${PLANET_ERAS.length}</span></div>
      <div class="planet-steps">${steps}</div>
      <p class="whale-lede">${esc(era.look)}</p>
      ${story ? `<button type="button" class="whale-song-ready planet-story-ready" data-p="story">${ICONS.radio}<span><b>News from ${esc(p.name)}</b><small>${esc(story.story.title)}: tap to read</small></span></button>` : ''}
      ${work}
      <ul class="whale-gives">
        <li>${ICONS.bolt}<span><b>+${pct}% income</b>: +${Math.round(PLANET.perProject * 100)}% for every project done${last ? `, and +${Math.round(PLANET.thrivingIncome * 100)}% for a thriving world` : ''}</span></li>
        ${path ? `<li>${ICONS.planet}<span><b>${esc(path.name)}</b>: ${esc(path.gives)}</span></li>` : `<li>${ICONS.planet}<span>At the Oceans era you choose what grows first, for a bonus of its own</span></li>`}
        ${last ? '' : `<li>${ICONS.scrap}<span>Once it thrives, trade shuttles bring scrap up to the station</span></li>`}
      </ul>
      ${heard.length ? `<h3 class="section-title">Stories</h3><div class="whale-songs">${heard.map((x) => `<button type="button" data-p="replay" data-id="${x.id}">${ICONS.radio}<span>${esc(x.story.title)}</span></button>`).join('')}</div>` : ''}`;
  }

  private renderStory(era: PlanetEra): void {
    $('planet-body').innerHTML = `
      <div class="whale-song planet-song">
        <div class="planet-hero small"><img src="${this.portrait()}" alt="" /></div>
        <h2>${esc(era.story.title)}</h2>
        ${era.story.lines.map((l, k) => `<p style="--d:${k * 0.6}s">${esc(l)}</p>`).join('')}
        <button type="button" class="primary" data-p="heard">${this.reading?.fresh ? 'Keep going' : 'Back'}</button>
      </div>`;
  }
}
