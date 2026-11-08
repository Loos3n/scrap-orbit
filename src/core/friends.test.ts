import { describe, expect, it } from 'vitest';
import { GIFTS_PER_DAY, GIFT_CRYSTALS, SEND_REWARDS_PER_DAY, addFriend, cleanName, codeFromBytes, giftSentToday, markGiftSent, normalizeCode, openGifts, prettyCode, stationCard } from './friends';
import { exportCode, importCode, newState } from './state';

const DAY = 86_400_000;

describe('friend codes', () => {
  it('makes readable codes and reads them back however they are typed', () => {
    const code = codeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 200]));
    expect(code).toHaveLength(8);
    expect(normalizeCode(prettyCode(code).toLowerCase())).toBe(code);
    expect(normalizeCode(` ${code.slice(0, 4)} - ${code.slice(4)} `)).toBe(code);
    expect(normalizeCode('ABCD')).toBeNull();
    expect(normalizeCode('ABCD-EF0O')).toBeNull();
  });

  it('cleans station names', () => {
    expect(cleanName('  <b>My   Station</b> with a very long name ')).toBe('bMy Station/b with a');
  });

  it('adds friends once and never yourself', () => {
    const s = newState(0);
    s.friends.mine = 'AAAABBBB';
    expect(addFriend(s, 'AAAABBBB', 'me')).toBe('self');
    expect(addFriend(s, 'CCCCDDDD', 'Pal')).toBe('added');
    expect(addFriend(s, 'CCCCDDDD', 'Pal 2')).toBe('known');
    expect(s.friends.list).toEqual([{ code: 'CCCCDDDD', name: 'Pal 2' }]);
  });

  it('lets one gift a day go to each friend, rewarding the first few', () => {
    const s = newState(0);
    const now = 10 * DAY;
    expect(giftSentToday(s, 'CCCCDDDD', now)).toBe(false);
    expect(markGiftSent(s, 'CCCCDDDD', now)).toBe(1);
    expect(giftSentToday(s, 'CCCCDDDD', now)).toBe(true);
    expect(giftSentToday(s, 'CCCCDDDD', now + DAY)).toBe(false);
    for (let i = 0; i < SEND_REWARDS_PER_DAY + 2; i++) markGiftSent(s, `X${i}`, now + DAY);
    expect(s.crystals).toBe(1 + SEND_REWARDS_PER_DAY);
  });

  it('opens a few gifts a day', () => {
    const s = newState(0);
    const now = 3 * DAY;
    expect(openGifts(s, 3, now)).toEqual({ opened: 3, crystals: 3 * GIFT_CRYSTALS });
    expect(openGifts(s, 10, now).opened).toBe(GIFTS_PER_DAY - 3);
    expect(openGifts(s, 1, now).opened).toBe(0);
    expect(openGifts(s, 1, now + DAY).opened).toBe(1);
  });

  it('keeps friends through a save code', () => {
    const s = newState(0);
    s.friends.mine = 'AAAABBBB';
    s.friends.name = 'Home';
    addFriend(s, 'CCCCDDDD', 'Pal');
    markGiftSent(s, 'CCCCDDDD', 5 * DAY);
    const back = importCode(exportCode(s), 6 * DAY)!;
    expect(back.friends.mine).toBe('AAAABBBB');
    expect(back.friends.list).toEqual([{ code: 'CCCCDDDD', name: 'Pal' }]);
    expect(giftSentToday(back, 'CCCCDDDD', 5 * DAY)).toBe(true);
  });

  it('describes the station for visitors', () => {
    const s = newState(0);
    s.owned.drone = 120;
    const card = stationCard(s);
    expect(card.best).toContain('Mk II');
    expect(card.machines).toBe(120);
  });
});
