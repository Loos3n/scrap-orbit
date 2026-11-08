import type { User } from 'firebase/auth';
import { cloudAvailable, signIn, watchUser } from '../cloud';
import {
  GIFT_CRYSTALS,
  addFriend,
  cleanName,
  defaultName,
  giftSentToday,
  giftsLeftToday,
  markGiftSent,
  normalizeCode,
  openGifts,
  prettyCode,
  removeFriend,
  stationCard,
} from '../core/friends';
import { dayKey } from '../core/meta';
import { D, type Decimal } from '../core/num';
import { codeForUser, fetchProfile, listGifts, publishProfile, removeGifts, sendGift, type Gift, type Profile } from '../friends';
import type { Game } from '../game';
import { ICONS } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** How often the player's own profile (picture and numbers) is refreshed while playing. */
const PUBLISH_MS = 30 * 60 * 1000;
/** How often the gift inbox is checked while playing. */
const INBOX_MS = 10 * 60 * 1000;
const SITE = 'https://scrap-orbit.web.app';

/**
 * Profile > Friends: the player's friend code and station name, the gift inbox, adding friends,
 * and visiting them (a picture of their station, a few numbers and a daily gift button).
 * Everything needs a Google sign-in; without one the tab explains how to get it.
 */
export class FriendsPanel {
  private user: User | null = null;
  private gifts: Gift[] = [];
  private lastPublish = 0;
  private lastInbox = 0;
  private busy = false;
  private visiting: Profile | null = null;
  /** True while gifts wait to be opened (lights the Profile button's dot). */
  hasGifts = false;

  constructor(
    private game: Game,
    private fmt: (d: Decimal) => string,
    private snapshot: () => string | null,
    private toast: (icon: string, html: string) => void,
  ) {
    $('fr-copy').addEventListener('click', () => void this.copy());
    $('fr-share').addEventListener('click', () => void this.share());
    $('fr-add').addEventListener('click', () => void this.addTyped());
    $('fr-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.addTyped();
    });
    const name = $<HTMLInputElement>('fr-name');
    name.addEventListener('change', () => {
      const s = this.game.state.friends;
      s.name = cleanName(name.value) || defaultName(s.mine);
      name.value = s.name;
      void this.publish(true);
    });
    $('fr-open').addEventListener('click', () => void this.openInbox());
    $('fr-off-btn').addEventListener('click', () => void this.connect());
    $('visit-close').addEventListener('click', () => this.closeVisit());
    $('friend-visit').addEventListener('click', (e) => {
      if (e.target === $('friend-visit')) this.closeVisit();
    });
    $('visit-gift').addEventListener('click', () => this.visiting && void this.gift(this.visiting.code, this.visiting.name));
    const remove = $('visit-remove');
    remove.addEventListener('click', () => {
      if (!this.visiting) return;
      if (remove.dataset.armed !== '1') {
        remove.dataset.armed = '1';
        remove.textContent = 'Tap again to remove';
        return;
      }
      removeFriend(this.game.state, this.visiting.code);
      this.closeVisit();
      this.render();
    });
    document.querySelector('[data-prof="friends"]')!.addEventListener('click', () => {
      this.render();
      if (this.user && Date.now() - this.lastInbox > 60_000) void this.checkInbox();
      if (this.user && Date.now() - this.lastPublish > 10 * 60_000) void this.publish(false);
    });
    $('profile-btn').addEventListener('click', () => this.render());
    this.readLink();
    if (!cloudAvailable()) {
      this.render();
      return;
    }
    void watchUser((u) => void this.onUser(u));
    window.setInterval(() => {
      if (!this.user || document.visibilityState !== 'visible') return;
      if (Date.now() - this.lastPublish > PUBLISH_MS) void this.publish(false);
      if (Date.now() - this.lastInbox > INBOX_MS) void this.checkInbox();
    }, 60_000);
  }

  /** A link like scrap-orbit.web.app/?friend=ABCDEFGH fills the code in, ready to add. */
  private readLink(): void {
    const code = normalizeCode(new URLSearchParams(location.search).get('friend') ?? '');
    if (!code) return;
    $<HTMLInputElement>('fr-input').value = prettyCode(code);
    history.replaceState(null, '', location.pathname);
    const open = window.setInterval(() => {
      if (this.game.state.tutorial >= 0 || document.querySelector('.modal:not([hidden])')) return;
      window.clearInterval(open);
      $('profile-btn').click();
      (document.querySelector('[data-prof="friends"]') as HTMLButtonElement).click();
      this.msg('A friend shared their code. Tap Add to add them.');
    }, 2000);
  }

  private async onUser(u: User | null): Promise<void> {
    this.user = u;
    if (u) {
      const f = this.game.state.friends;
      f.mine = await codeForUser(u.uid);
      if (!f.name) f.name = defaultName(f.mine);
      // Friends added before this account (another device, say) can't include ourselves.
      removeFriend(this.game.state, f.mine);
      void this.publish(false);
      void this.checkInbox();
    } else {
      this.gifts = [];
      this.hasGifts = false;
    }
    this.render();
  }

  private async connect(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.msg('');
    $('fr-off-text').textContent = 'Connecting…';
    try {
      await signIn();
    } catch (e) {
      $('fr-off-text').textContent = `That didn't work: ${(e as Error).message || 'please try again'}.`;
    } finally {
      this.busy = false;
    }
  }

  /** Puts this player's picture, name and numbers where friends can see them. */
  private async publish(force: boolean): Promise<void> {
    const f = this.game.state.friends;
    if (!this.user || !f.mine) return;
    if (!force && Date.now() - this.lastPublish < 60_000) return;
    this.lastPublish = Date.now();
    try {
      await publishProfile({ code: f.mine, name: f.name || defaultName(f.mine), pic: this.snapshot() ?? '', card: stationCard(this.game.state) });
    } catch (e) {
      console.warn('Friend profile not published', e);
      if (force) this.msg('Could not save your station name. Check your connection and try again.');
    }
  }

  private async checkInbox(): Promise<void> {
    const f = this.game.state.friends;
    if (!this.user || !f.mine) return;
    this.lastInbox = Date.now();
    try {
      this.gifts = await listGifts(f.mine);
    } catch (e) {
      console.warn('Gift inbox not read', e);
      return;
    }
    this.render();
  }

  private async openInbox(): Promise<void> {
    const f = this.game.state.friends;
    if (!this.gifts.length || this.busy) return;
    const now = Date.now();
    const take = this.gifts.slice(0, giftsLeftToday(this.game.state, now));
    if (!take.length) return;
    this.busy = true;
    try {
      // Remove them first: a gift is only paid once it is gone from the inbox.
      await removeGifts(f.mine, take.map((g) => g.id));
      const { crystals } = openGifts(this.game.state, take.length, now);
      this.gifts = this.gifts.slice(take.length);
      const names = [...new Set(take.map((g) => g.name || 'A friend'))];
      const from = names.length > 2 ? `${names.slice(0, 2).map(esc).join(', ')} and ${names.length - 2} more` : names.map(esc).join(' and ');
      this.toast(ICONS.gift.replace('currentColor', '#ff8fb4'), `<b>Gifts from ${from}!</b> +${crystals} crystals`);
    } catch (e) {
      this.msg(`The gifts didn't open: ${(e as Error).message || 'please try again'}.`);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async addTyped(): Promise<void> {
    const input = $<HTMLInputElement>('fr-input');
    const code = normalizeCode(input.value);
    if (!code) {
      this.msg('A friend code is 8 letters and numbers, like ABCD-EFGH.');
      return;
    }
    if (!this.user) {
      this.msg('Connect a Google account first.');
      return;
    }
    if (code === this.game.state.friends.mine) {
      this.msg("That's your own code. Share it with a friend instead!");
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.msg('Looking for that station…');
    try {
      const p = await fetchProfile(code);
      if (!p) {
        this.msg("No station has that code yet. Check it, or ask your friend to open Friends once so it's ready.");
        return;
      }
      const result = addFriend(this.game.state, code, p.name);
      if (result === 'full') this.msg('Your friends list is full. Remove someone to add more.');
      else {
        input.value = '';
        this.msg(result === 'known' ? `${p.name} is already your friend.` : `${p.name} added!`);
        this.render();
        if (result === 'added') this.showVisit(p);
      }
    } catch (e) {
      this.msg(`Couldn't look that up: ${(e as Error).message || 'please try again'}.`);
    } finally {
      this.busy = false;
    }
  }

  private async visit(code: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const p = await fetchProfile(code);
      if (!p) {
        this.msg("That station isn't there any more.");
        return;
      }
      addFriend(this.game.state, code, p.name);
      this.render();
      this.showVisit(p);
    } catch (e) {
      this.msg(`Couldn't visit: ${(e as Error).message || 'please try again'}.`);
    } finally {
      this.busy = false;
    }
  }

  private showVisit(p: Profile): void {
    this.visiting = p;
    $('visit-name').textContent = p.name || defaultName(p.code);
    $('visit-pic').innerHTML = p.pic ? `<img alt="Their station" src="${p.pic}" />` : '<span>No picture yet</span>';
    const c = p.card;
    const rows: [string, string][] = c
      ? [
          ['Friend code', prettyCode(p.code)],
          ['Sector', c.sector],
          ['Scrap salvaged', this.fmt(D(c.allTime || '0'))],
          ['Relocations', String(c.relocations)],
          ...(c.shifts ? ([['Galaxy shifts', String(c.shifts)]] as [string, string][]) : []),
          ...(c.best ? ([['Biggest machine', c.best]] as [string, string][]) : []),
          ['Machines', c.machines.toLocaleString('en-US')],
          ...(c.pet ? ([['Pet', c.pet]] as [string, string][]) : []),
          ['Achievements', String(c.achievements)],
          ['Best login streak', `${c.streak} days`],
        ]
      : [['Friend code', prettyCode(p.code)]];
    $('visit-stats').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    if (p.updatedAt) $('visit-stats').insertAdjacentHTML('beforeend', `<dt>Last seen</dt><dd>${esc(ago(p.updatedAt))}</dd>`);
    const remove = $('visit-remove');
    remove.dataset.armed = '';
    remove.textContent = 'Remove friend';
    this.syncVisitGift();
    $('friend-visit').hidden = false;
  }

  private syncVisitGift(): void {
    if (!this.visiting) return;
    const sent = giftSentToday(this.game.state, this.visiting.code, Date.now());
    const b = $<HTMLButtonElement>('visit-gift');
    b.disabled = sent;
    b.textContent = sent ? 'Gift sent today' : `Send a gift (${GIFT_CRYSTALS} crystals for them)`;
  }

  private closeVisit(): void {
    $('friend-visit').hidden = true;
    this.visiting = null;
  }

  private async gift(code: string, name: string): Promise<void> {
    const s = this.game.state;
    const now = Date.now();
    if (!this.user || this.busy || giftSentToday(s, code, now)) return;
    this.busy = true;
    try {
      await sendGift(code, s.friends.mine, s.friends.name || defaultName(s.friends.mine), dayKey(now));
      const earned = markGiftSent(s, code, now);
      this.toast(ICONS.gift.replace('currentColor', '#ff8fb4'), `<b>Gift sent to ${esc(name || 'your friend')}!</b>${earned ? ` +${earned} crystal for you` : ''}`);
    } catch (e) {
      this.msg(`The gift didn't send: ${(e as Error).message || 'please try again'}.`);
    } finally {
      this.busy = false;
      this.render();
      this.syncVisitGift();
    }
  }

  private shareText(): string {
    const code = this.game.state.friends.mine;
    return `Add my space station in Scrap Orbit! My friend code is ${prettyCode(code)}. ${SITE}/?friend=${code}`;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prettyCode(this.game.state.friends.mine));
      this.msg('Code copied.');
    } catch {
      this.msg(`Your code is ${prettyCode(this.game.state.friends.mine)}.`);
    }
  }

  private async share(): Promise<void> {
    const text = this.shareText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelled, or not allowed here: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      this.msg('Invite copied. Paste it to a friend!');
    } catch {
      this.msg(text);
    }
  }

  private msg(text: string): void {
    $('fr-msg').textContent = text;
  }

  render(): void {
    const s = this.game.state;
    const f = s.friends;
    const on = !!this.user && !!f.mine;
    const left = giftsLeftToday(s, Date.now());
    this.hasGifts = on && this.gifts.length > 0 && left > 0;
    $('friends-dot').hidden = !this.hasGifts;
    $('fr-on').hidden = !on;
    $('fr-off').hidden = on;
    if (!on) {
      const available = cloudAvailable();
      if (!this.busy)
        $('fr-off-text').textContent = available
          ? 'Connect your Google account to get a friend code. Friends can visit your station and send you a gift every day.'
          : `Friend codes work in the Scrap Orbit app and at ${SITE.replace('https://', '')}, with a Google account.`;
      $('fr-off-btn').hidden = !available;
      return;
    }
    $('fr-code').textContent = prettyCode(f.mine);
    const name = $<HTMLInputElement>('fr-name');
    if (document.activeElement !== name) name.value = f.name;
    $('fr-gifts').hidden = this.gifts.length === 0;
    const n = this.gifts.length;
    $('fr-gifts-text').innerHTML =
      left > 0 ? `<b>${n} gift${n === 1 ? '' : 's'}</b> from friends waiting` : `<b>${n} gift${n === 1 ? '' : 's'}</b> waiting. You've opened today's few, so these keep until tomorrow.`;
    $<HTMLButtonElement>('fr-open').hidden = left <= 0;
    $('fr-count').textContent = f.list.length ? String(f.list.length) : '';
    const list = $('fr-list');
    if (!f.list.length) {
      list.innerHTML = '<li class="fr-empty">No friends yet. Share your code, or add theirs above.</li>';
      return;
    }
    const now = Date.now();
    list.innerHTML = f.list
      .map((x) => {
        const sent = giftSentToday(s, x.code, now);
        return `<li data-code="${x.code}"><span class="fr-who"><b>${esc(x.name || defaultName(x.code))}</b><small>${prettyCode(x.code)}</small></span><button type="button" class="fr-btn" data-act="visit">Visit</button><button type="button" class="fr-btn${sent ? '' : ' fr-main'}" data-act="gift"${sent ? ' disabled' : ''}>${sent ? 'Sent' : 'Gift'}</button></li>`;
      })
      .join('');
    list.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        const code = b.closest('li')!.dataset.code!;
        const friend = f.list.find((x) => x.code === code);
        if (b.dataset.act === 'visit') void this.visit(code);
        else void this.gift(code, friend?.name ?? '');
      }),
    );
  }
}

function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 2) return 'just now';
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}
