import { VISITORS, VISITS, hearts, isFriend, visitorHere, type VisitChoice, type VisitReward, type VisitorDef } from '../core/visitors';
import type { VisitResult } from '../core/meta';
import { fleetOpen } from '../core/fleet';
import { formatDuration, type Decimal } from '../core/num';
import type { Game } from '../game';
import { ICONS } from './icons';
import { portrait } from './portrait';
import type { CrewDef } from '../core/content';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
type Fmt = (v: Decimal | number) => string;

/** A visitor drawn like the crew. */
const face = (v: VisitorDef, locked = false) => portrait({ look: v.look } as CrewDef, locked);

const heartRow = (n: number) => Array.from({ length: VISITS.hearts }, (_, i) => `<i class="${i < n ? 'on' : ''}">${ICONS.heart}</i>`).join('');

/** The reward chips under an answer. */
function rewardChips(g: VisitReward, fleet: boolean): string {
  const out: string[] = [];
  if (g.scrapMin) out.push(`${ICONS.scrap}${g.scrapMin}m of scrap`);
  if (g.crystals || (g.plates && !fleet)) out.push(`${ICONS.crystal}${(g.crystals ?? 0) + (fleet ? 0 : g.plates ?? 0)}`);
  if (g.plates && fleet) out.push(`${ICONS.plate}${g.plates} plates`);
  if (g.bait) out.push(`${ICONS.fish}${g.bait} bait`);
  if (g.surge) out.push(`${ICONS.bolt}5x income ${g.surge}s`);
  if (g.overdrive) out.push(`${ICONS.bolt}Overdrive charge`);
  return out.map((t) => `<span class="visit-chip">${t}</span>`).join('');
}

/** The docked-visitor pill, the visit card with its two answers, and the guestbook. */
export class VisitorPanel {
  private shownId = '';
  private result: VisitResult | null = null;
  private bookKey = '';

  constructor(
    private game: Game,
    private fmt: Fmt,
  ) {
    $('visitor-banner').addEventListener('click', () => this.open());
    $('visitor-close').addEventListener('click', () => this.close());
    $('visitor').addEventListener('click', (e) => {
      if (e.target === $('visitor')) this.close();
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-answer],button[data-bye]');
      if (!btn) return;
      if (btn.dataset.bye) return this.close();
      this.game.answerVisitor(btn.dataset.answer as 'a' | 'b');
    });
  }

  open(): void {
    this.result = null;
    this.shownId = '';
    $('visitor').hidden = false;
    this.render();
  }

  close(): void {
    $('visitor').hidden = true;
    this.result = null;
  }

  /** Shows what an answer brought, on the card that's still open. */
  answered(r: VisitResult): void {
    this.result = r;
    this.shownId = '';
    $('visitor').hidden = false;
    this.render();
  }

  render(): void {
    const s = this.game.state;
    const now = Date.now();
    const here = visitorHere(s, now);
    $('visitor-banner').hidden = !here;
    if (here) {
      const t = formatDuration((s.visitors.here!.until - now) / 1000);
      if ($('visitor-time').textContent !== t) $('visitor-time').textContent = t;
      $('visitor-who').textContent = here.def.name;
    }
    this.renderBook();
    if ($('visitor').hidden) return;
    if (this.result) return this.renderResult(this.result);
    if (!here) return this.close();
    const id = `${here.def.id}|${s.visitors.here!.req}|${s.crystals}`;
    if (id === this.shownId) return;
    this.shownId = id;
    const v = here.def;
    const fleet = fleetOpen(s) && s.fleet.welcomed;
    const met = (s.visitors.met[v.id] ?? 0) > 0;
    const choice = (k: 'a' | 'b', c: VisitChoice) => {
      const short = c.pay && s.crystals < c.pay;
      return `<button type="button" class="visit-answer" data-answer="${k}" ${short ? 'disabled' : ''}><b>${esc(c.label)}</b><span class="visit-chips">${c.pay ? `<span class="visit-chip pay">Pay ${ICONS.crystal}${c.pay}</span>` : ''}${rewardChips(c.give, fleet)}</span></button>`;
    };
    $('visitor-body').innerHTML = `
      <div class="visit-who" style="--c:${hex(v.color)}"><div class="visit-face">${face(v)}</div><div><h2>${esc(v.name)}</h2><small>${esc(v.title)}</small><div class="visit-hearts">${heartRow(hearts(s, v.id))}</div></div></div>
      <p class="visit-ask">“${esc(here.req.ask)}”</p>
      ${met ? `<p class="visit-likes">${ICONS.heart}<span>${esc(v.likes)}</span></p>` : `<p class="visit-likes">${ICONS.heart}<span>First visit! Each answer pays something; one of them is what ${esc(v.name)} hoped for, and wins a heart.</span></p>`}
      <div class="visit-answers">${choice('a', here.req.a)}${choice('b', here.req.b)}</div>`;
  }

  private renderResult(r: VisitResult): void {
    const key = `r:${r.id}:${r.hearts}`;
    if (key === this.shownId) return;
    this.shownId = key;
    const v = VISITORS.find((x) => x.id === r.id)!;
    const got: string[] = [];
    if (r.scrap) got.push(`${ICONS.scrap}+${this.fmt(r.scrap)}`);
    if (r.crystals) got.push(`${ICONS.crystal}+${r.crystals}`);
    if (r.plates) got.push(`${ICONS.plate}+${r.plates} plates`);
    if (r.bait) got.push(`${ICONS.fish}+${r.bait} bait`);
    if (r.surge) got.push(`${ICONS.bolt}5x income for ${r.surge}s`);
    if (r.overdrive) got.push(`${ICONS.bolt}Overdrive ready`);
    const mood = r.friend
      ? `<div class="visit-friend">${ICONS.heart}<div><b>${esc(v.name)} is a friend of the station!</b><span>They left a keepsake: <b>${esc(v.keepsake.name)}</b>. ${esc(v.keepsake.text)}</span></div></div>`
      : r.liked
        ? `<p class="visit-mood liked">${ICONS.heart}That was the answer they hoped for!</p>`
        : `<p class="visit-mood">Not quite what they hoped for, but they’re grateful.</p>`;
    $('visitor-body').innerHTML = `
      <div class="visit-who" style="--c:${hex(v.color)}"><div class="visit-face">${face(v)}</div><div><h2>${esc(v.name)}</h2><small>${esc(v.title)}</small><div class="visit-hearts">${heartRow(r.hearts)}</div></div></div>
      <p class="visit-ask">“${esc(r.reply)}”</p>
      ${mood}
      <div class="visit-chips got">${got.map((t) => `<span class="visit-chip">${t}</span>`).join('')}</div>
      <button type="button" class="primary visit-bye" data-bye="1">Wave goodbye</button>`;
  }

  /** Profile > Collections: everyone who has visited, their hearts, and what wins them over. */
  private renderBook(): void {
    if ($('profile').hidden || $('prof-book').hidden) return;
    const s = this.game.state;
    const key = JSON.stringify(s.visitors.hearts) + JSON.stringify(s.visitors.met);
    if (key === this.bookKey) return;
    this.bookKey = key;
    const friends = VISITORS.filter((v) => isFriend(s, v.id)).length;
    $('guest-sum').textContent = `${friends}/${VISITORS.length} friends`;
    $('guest-list').innerHTML = VISITORS.map((v) => {
      const met = (s.visitors.met[v.id] ?? 0) > 0;
      if (!met) return `<li class="guest locked"><div class="guest-face">${face(v, true)}</div><div><b>???</b><small>Not met yet</small></div></li>`;
      const friend = isFriend(s, v.id);
      return `<li class="guest${friend ? ' friend' : ''}" style="--c:${hex(v.color)}"><div class="guest-face">${face(v)}</div><div><b>${esc(v.name)}</b><small>${esc(v.title)}</small><div class="visit-hearts">${heartRow(hearts(s, v.id))}</div><div class="guest-note">${friend ? `${esc(v.keepsake.name)}: ${esc(v.keepsake.text)}` : `Likes: ${esc(v.likes)}`}</div></div></li>`;
    }).join('');
  }
}
