import { FLEET, SHIPS, fleetOpen, fleetRanks, jobCost, jobSecondsLeft, patrolFull, patrolHaul, patrolRate, powerText, shipRank, shipsBuilt, type ShipDef } from '../core/fleet';
import { STORY } from '../core/story';
import { formatDuration } from '../core/num';
import type { Game } from '../game';
import * as art from '../scene/art';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const plateCost = (n: number) => `<span class="cost-plate">${ICONS.plate}<span>${n.toLocaleString('en-US')}</span></span>`;
const crystalCost = (n: number) => `<span class="cost-crystal">${ICONS.crystal}<span>${n.toLocaleString('en-US')}</span></span>`;
const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`);

/** Ship pictures are painted once and kept (the ghost and the rebuilt one). */
const pics = new Map<string, string>();
function shipPic(def: ShipDef, ghost: boolean): string {
  const key = `${def.id}${ghost ? ':g' : ''}`;
  let url = pics.get(key);
  if (url === undefined) {
    url = art.fleetShipUrl(def.hull, hex(def.color), SHIPS.indexOf(def) * 17 + 5, ghost);
    pics.set(key, url);
  }
  return url;
}

/** Prestige > Fleet: the drydock, the patrol haul and the eight ships of the Hollow Fleet. */
export class FleetPanel {
  private key = '';

  constructor(private game: Game) {
    $('tab-fleet').addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-ship],button[data-rush],button[data-patrol]');
      if (!btn) return;
      if (btn.dataset.ship) this.game.startShip(btn.dataset.ship as ShipDef['id']);
      else if (btn.dataset.rush) this.game.rushShip();
      else this.game.collectPatrol();
      this.key = '';
      this.render();
    });
  }

  /** Something to do here: the drydock is free and a job is affordable, or the patrol haul is worth collecting. */
  hasNews(): boolean {
    const s = this.game.state;
    if (!fleetOpen(s) || !s.fleet.welcomed) return false;
    const now = Date.now();
    if (patrolFull(s, now)) return true;
    if (s.fleet.job) return false;
    return SHIPS.some((d) => this.canStart(d));
  }

  private canStart(def: ShipDef): boolean {
    const s = this.game.state;
    const rank = shipRank(s, def.id);
    if (rank >= FLEET.maxRank) return false;
    if (rank === 0 && SHIPS.indexOf(def) > shipsBuilt(s).length) return false;
    return s.fleet.plates >= jobCost(def, rank).plates;
  }

  render(): void {
    if ($('tab-fleet').hidden) return;
    const s = this.game.state;
    const now = Date.now();
    const f = s.fleet;
    const open = fleetOpen(s) && f.welcomed;
    const left = jobSecondsLeft(s, now);
    const rush = this.game.shipRushPrice(now);
    const haul = patrolHaul(s, now);
    const key = `${open}|${f.plates}|${JSON.stringify(f.ranks)}|${f.job?.ship}|${Math.ceil(left)}|${rush}|${s.crystals >= rush}|${haul}|${s.story.heard.size}`;
    if (key === this.key) return;
    this.key = key;
    if (!open) {
      const heard = s.story.heard.size;
      $('fleet-card').innerHTML = `
        <div class="fleet-head"><div class="fleet-art">${ICONS.fleet}</div><div><div class="eyebrow">The Hollow Fleet</div><div class="fleet-count">Eight ships to rebuild</div></div></div>
        <p class="fleet-desc">Forty ships left a dying sun. Eight of them can still be saved. Once the Lantern comes home, Captain Vey will open a drydock beside the station, and every ship you rebuild joins a fleet that circles the station with a lasting power.</p>
        <div class="galaxy-lock">${ICONS.lock}Opens when the Lantern docks, at the end of the radio story (${heard} of ${STORY.length} transmissions heard).</div>`;
      $('fleet-list').innerHTML = SHIPS.map((d) => `<li class="ship-row ghost" style="--c:${hex(d.color)}"><img class="ship-pic" src="${shipPic(d, true)}" alt=""><div class="ship-text"><b>${esc(d.name)}</b><small>${esc(d.role)}</small><div class="ship-power">${esc(powerText(d.power, 1))}</div></div></li>`).join('');
      return;
    }
    const job = f.job;
    const jobDef = job ? SHIPS.find((d) => d.id === job.ship)! : null;
    const dock = jobDef
      ? `<div class="dock-job"><img class="ship-pic small" src="${shipPic(jobDef, shipRank(s, jobDef.id) === 0)}" alt=""><div><b>${shipRank(s, jobDef.id) === 0 ? 'Rebuilding' : 'Refitting'} ${esc(jobDef.name)}</b><small>Ready in ${formatDuration(left)}</small><div class="bar"><i style="width:${Math.round(100 * (1 - left / (jobCost(jobDef, shipRank(s, jobDef.id)).hours * 3600)))}%"></i></div></div><button type="button" class="crew-btn" data-rush="1" ${s.crystals >= rush ? '' : 'disabled'}>Finish ${crystalCost(rush)}</button></div>`
      : `<div class="dock-job idle">${ICONS.fleet}<div><b>The drydock is free</b><small>Pick a ship below to rebuild or refit.</small></div></div>`;
    const rate = patrolRate(s);
    const patrol =
      rate > 0
        ? `<div class="patrol"><div><b>Patrol haul</b><small>${haul > 0 ? `${haul} ${haul === 1 ? 'plate' : 'plates'} waiting` : 'Out on patrol'} · ${Math.round(rate * 24 * 10) / 10} a day${patrolFull(s, now) ? ' · <em>full</em>' : ''}</small></div><button type="button" class="crew-btn" data-patrol="1" ${haul > 0 ? '' : 'disabled'}>Collect</button></div>`
        : '';
    $('fleet-card').innerHTML = `
      <div class="fleet-head"><div class="fleet-art">${ICONS.plate}</div><div><div class="eyebrow">Hull plates</div><div class="fleet-count"><b>${f.plates.toLocaleString('en-US')}</b> in the drydock</div></div><div class="fleet-ranks">${shipsBuilt(s).length}/8 ships<br>${fleetRanks(s)} ranks</div></div>
      ${dock}${patrol}
      <p class="fleet-desc">Plates come from boss wrecks (${FLEET.bossPlates} each), relocations (${FLEET.relocatePlates}), galaxy shifts (${FLEET.starPlates} a star) and the patrol. The fleet keeps its ranks through every reset.</p>`;
    const built = shipsBuilt(s).length;
    $('fleet-list').innerHTML = SHIPS.map((d, i) => {
      const rank = shipRank(s, d.id);
      const pips = Array.from({ length: FLEET.maxRank }, (_, k) => `<i class="${k < rank ? 'on' : ''}"></i>`).join('');
      const busy = job?.ship === d.id;
      let btn: string;
      if (rank >= FLEET.maxRank) btn = `<span class="offer-sold">${ICONS.check}Top rank</span>`;
      else if (busy) btn = `<span class="offer-sold">${ICONS.clock}In dock</span>`;
      else if (rank === 0 && i > built) btn = `<span class="ship-wait">After ${esc(SHIPS[i - 1].name)}</span>`;
      else {
        const c = jobCost(d, rank);
        btn = `<button type="button" class="crew-btn ship-btn" data-ship="${d.id}" ${!job && s.fleet.plates >= c.plates ? '' : 'disabled'}><span>${rank === 0 ? 'Rebuild' : `Rank ${rank + 1}`}</span>${plateCost(c.plates)}<small>${hoursText(c.hours)}</small></button>`;
      }
      const power = rank > 0 ? `${esc(powerText(d.power, rank))}${rank < FLEET.maxRank ? ` <span class="ship-next">Next: ${esc(powerText(d.power, rank + 1))}</span>` : ''}` : esc(powerText(d.power, 1));
      const ghost = rank === 0;
      return `<li class="ship-row${ghost ? ' ghost' : ''}${busy ? ' busy' : ''}" style="--c:${hex(d.color)}"><img class="ship-pic" src="${shipPic(d, ghost)}" alt=""><div class="ship-text"><b>${esc(d.name)}</b><small>${esc(d.role)}</small><span class="ship-pips">${pips}</span><div class="ship-power">${power}</div><div class="ship-lore">${esc(d.lore)}</div></div>${btn}</li>`;
    }).join('');
  }
}
