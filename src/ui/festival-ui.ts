import { FESTIVAL, FESTIVAL_PAINT, FESTIVAL_SHOP, canBuyFestival, cocoaActive, festivalActive, festivalOwns, festivalSecondsLeft, type FestivalItemId } from '../core/festival';
import { formatDuration } from '../core/num';
import type { Game } from '../game';
import { ornamentUrl } from '../scene/art';
import { ICONS } from './icons';

/**
 * The Frost Festival: a snowflake chip by the Next goal line while it runs, and a card with the
 * snowflakes saved up, how to earn more, and the festival shop.
 */

const $ = (id: string) => document.getElementById(id)!;

const pic = (id: FestivalItemId): string => {
  if (id === 'snowman' || id === 'startree') return `<img src="${ornamentUrl(id)}" alt="">`;
  if (id === 'hoarfrost') return `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#${FESTIVAL_PAINT.tint.toString(16)}" stroke="#9fe6ff" stroke-width="2"/><path d="M13 15a9 9 0 0 1 8-5" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  if (id === 'cocoa')
    return `<svg viewBox="0 0 40 40"><path d="M9 14h20v12a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill="#ff8fa8" stroke="#4a0f26" stroke-width="1.6"/><path d="M29 17h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#4a0f26" stroke-width="2"/><ellipse cx="19" cy="14.5" rx="9.5" ry="2.5" fill="#7a4a32"/><path d="M15 10c-2-3 2-4 0-7M21 10c-2-3 2-4 0-7" stroke="#dfe8ff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></svg>`;
  return `<svg viewBox="0 0 40 40"><path d="M14 5h12v14l6 8a6 6 0 0 1-5 9h-6a8 8 0 0 1-7-5z" fill="#e8324e" stroke="#45091a" stroke-width="1.6"/><rect x="12" y="4" width="16" height="6" rx="2" fill="#fff"/><path d="M20 17l3 5-3 5-3-5z" fill="#5cd6ff"/></svg>`;
};

export class FestivalPanel {
  private key = '';

  constructor(
    private game: Game,
    private onPreview: (on: boolean) => void,
  ) {
    $('festival-chip').addEventListener('click', () => this.open());
    $('festival-close').addEventListener('click', () => ($('festival').hidden = true));
    $('festival').addEventListener('click', (e) => {
      if (e.target === $('festival')) $('festival').hidden = true;
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fest]');
      if (btn) {
        this.game.buyFestival(btn.dataset.fest as FestivalItemId);
        this.key = '';
        this.render();
      }
    });
    // The preview switch shows only in the playable test build, so the festival can be tried in November.
    const row = $('opt-festival-row');
    row.hidden = import.meta.env.MODE !== 'single' && !import.meta.env.DEV;
    const box = $('opt-festival') as HTMLInputElement;
    box.checked = game.state.festival.test;
    box.addEventListener('change', () => {
      game.state.festival.test = box.checked;
      this.onPreview(box.checked);
      this.render();
    });
  }

  open(): void {
    $('festival').hidden = false;
    this.key = '';
    this.render();
  }

  render(): void {
    const s = this.game.state;
    const now = Date.now();
    const on = festivalActive(s, now);
    const chip = $('festival-chip');
    chip.hidden = !on;
    const flakes = s.festival.flakes.toLocaleString('en-US');
    if ($('festival-chip-text').textContent !== flakes) $('festival-chip-text').textContent = flakes;
    chip.setAttribute('aria-label', `${FESTIVAL.name}: ${flakes} snowflakes`);
    if ($('festival').hidden) return;
    if (!on) {
      $('festival').hidden = true;
      return;
    }
    const left = festivalSecondsLeft(now);
    const cocoaLeft = cocoaActive(s, now) ? (s.festival.cocoaUntil - now) / 1000 : 0;
    const key = `${flakes}|${[...s.festival.bought].join()}|${Math.floor(cocoaLeft / 60)}|${Math.floor(left / 3600)}|${s.festival.test}`;
    if (key === this.key) return;
    this.key = key;
    $('festival-ends').textContent = s.festival.test && left > 40 * 86_400 ? 'Preview' : `Ends in ${left >= 86_400 ? `${Math.floor(left / 86_400)} days` : formatDuration(left)}`;
    $('festival-flakes').textContent = flakes;
    const cocoa = $('festival-cocoa');
    cocoa.hidden = cocoaLeft <= 0;
    cocoa.textContent = `Hot cocoa: ${FESTIVAL.cocoaMult}x income for ${formatDuration(cocoaLeft)} more`;
    $('festival-shop').innerHTML = FESTIVAL_SHOP.map((item) => {
      const owned = !item.repeat && festivalOwns(s, item.id);
      const can = canBuyFestival(s, item.id, now);
      const action = owned ? '<span class="owned">Owned</span>' : `<button type="button" data-fest="${item.id}" ${can ? '' : 'disabled'}>${ICONS.snowflake}${item.cost}</button>`;
      return `<li><span class="fs-pic">${pic(item.id)}</span><span class="grow"><b>${item.name}</b><small>${item.desc}</small></span>${action}</li>`;
    }).join('');
  }
}
