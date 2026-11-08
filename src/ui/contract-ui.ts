import { GENERATORS } from '../core/config';
import { contractDef, contractProgress, goalText, sprintLeft } from '../core/contracts';
import type { Game } from '../game';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/**
 * Run contracts on screen: the "Pick a contract" window after a relocation (once the jump, the
 * sector card and any celebration are over), and a slim progress line at the top of the Build tab.
 */
export class ContractPanel {
  private shownFor = '';

  constructor(private game: Game) {
    $('contract-skip').addEventListener('click', () => this.pick(null));
    $('contract-options').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.contract-opt');
      if (b) this.pick(Number(b.dataset.i));
    });
  }

  private pick(index: number | null): void {
    $('contract-pick').hidden = true;
    this.shownFor = '';
    this.game.pickContract(index);
  }

  /** Nothing else on screen: no jump, card, celebration or other window. */
  private calm(): boolean {
    if (document.body.classList.contains('cinematic')) return false;
    if (!$('sector-card').hidden || !$('fanfare').hidden) return false;
    return !document.querySelector('.modal:not([hidden]):not(#contract-pick), #coach:not([hidden])');
  }

  render(): void {
    const s = this.game.state;
    const offers = s.contractOffers;
    const modal = $('contract-pick');
    if (!offers.length) modal.hidden = true;
    else if (modal.hidden && this.calm()) {
      const key = offers.map((o) => o.id + o.goal).join();
      if (this.shownFor !== key) {
        this.shownFor = key;
        $('contract-options').innerHTML = offers
          .map((o, i) => {
            const d = contractDef(o.id);
            return `<button class="contract-opt" type="button" data-i="${i}" style="--c:${hex(d.color)}"><b>${esc(d.name)}</b><span class="rule">${esc(d.rule)}</span><span class="goal">Goal: ${esc(goalText(o))}</span></button>`;
          })
          .join('');
      }
      modal.hidden = false;
    }

    const line = $('contract-line');
    const c = s.contract;
    line.hidden = !c;
    if (!c) return;
    const d = contractDef(c.id);
    line.style.setProperty('--c', hex(d.color));
    line.classList.toggle('done', c.done);
    const p = contractProgress(s)!;
    setText($('contract-line-name'), d.name);
    const left = sprintLeft(s, Date.now());
    // On the slim line the clock comes first, so a narrow phone cuts the goal, never the time.
    const goal = left !== null ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left · Build a ${GENERATORS[c.goal].name}` : goalText(c);
    setText($('contract-line-goal'), c.done ? 'Goal met!' : goal);
    setText($('contract-line-pct'), c.done ? '✓' : `${p.have}/${p.need}`);
    ($('contract-line-bar') as HTMLElement).style.width = `${(p.pct * 100).toFixed(1)}%`;
  }
}
