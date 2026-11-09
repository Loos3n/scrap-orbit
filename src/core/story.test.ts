import { describe, expect, it } from 'vitest';
import { bonuses } from './expansion';
import { FINALE_ID, STORY, nextStory, pendingStory, radioOpen, storyDone, storyIncome } from './story';
import { deserialize, newState, serialize } from './state';

const heardAll = (s: ReturnType<typeof newState>, upTo: string) => {
  for (const e of STORY) {
    s.story.heard.add(e.id);
    if (e.id === upTo) break;
  }
};

describe('Hollow Fleet story', () => {
  it('has unique ids, short lines, and ends with the finale', () => {
    expect(new Set(STORY.map((e) => e.id)).size).toBe(STORY.length);
    expect(STORY.at(-1)!.id).toBe(FINALE_ID);
    for (const e of STORY) for (const l of e.lines) expect(l.text.length).toBeLessThanOrEqual(140);
  });

  it('starts once the tutorial is done and the captain has played a little', () => {
    const s = newState(0);
    expect(pendingStory(s)).toBeNull();
    expect(radioOpen(s)).toBe(false);
    s.tutorial = -1;
    s.stats.playSec = 200;
    expect(pendingStory(s)?.id).toBe('static');
    expect(radioOpen(s)).toBe(true);
  });

  it('plays in order: a later moment waits for the earlier transmissions', () => {
    const s = newState(0);
    s.tutorial = -1;
    s.stats.playSec = 200;
    s.stats.relocations = 8;
    // Bosses never broken: the second transmission holds everything after it back.
    s.story.heard.add('static');
    expect(pendingStory(s)).toBeNull();
    expect(nextStory(s)?.id).toBe('insignia');
    s.stats.bosses = 1;
    expect(pendingStory(s)?.id).toBe('insignia');
  });

  it('reaches the finale in the third galaxy with a Dyson Collector', () => {
    const s = newState(0);
    heardAll(s, 'light');
    s.galaxy.shifts = 2;
    expect(pendingStory(s)).toBeNull();
    s.owned.dyson = 1;
    expect(pendingStory(s)?.id).toBe(FINALE_ID);
  });

  it('docks the Lantern for +50% income once the finale is heard, and keeps it through a save', () => {
    const s = newState(0);
    const before = bonuses(s).income;
    heardAll(s, FINALE_ID);
    expect(storyDone(s)).toBe(true);
    expect(storyIncome(s)).toBe(0.5);
    expect(bonuses(s).income).toBeCloseTo(before + 0.5);
    const back = deserialize(serialize(s), 0)!;
    expect(storyDone(back)).toBe(true);
    expect(back.story.heard.size).toBe(STORY.length);
  });
});
