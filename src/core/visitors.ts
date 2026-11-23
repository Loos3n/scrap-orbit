import type { CrewDef } from './content';
import type { Bonuses } from './expansion';
import type { GameState } from './state';

/*
 * Dock visitors: now and then a little shuttle docks and someone steps aboard with a favour to
 * ask. Every request has two answers, each with its own reward, and one of them is the answer
 * that visitor was hoping for, which wins a heart. Learn what each of them likes (the guestbook
 * notes it after the first visit) and at three hearts they become a friend of the station and
 * leave a keepsake: a small bonus that lasts forever.
 *
 * Definitions and pure reads live here; Game.answerVisitor applies an answer.
 */

export type VisitorId = 'quill' | 'juniper' | 'brass' | 'nana' | 'ziggy' | 'wick' | 'sal' | 'ember';

/** What an answer pays. Scrap is in minutes of the station's income. */
export interface VisitReward {
  scrapMin?: number;
  crystals?: number;
  bait?: number;
  /** A lucky-crate Surge (income x2) for this many seconds. */
  surge?: number;
  /** Recharges Overdrive. */
  overdrive?: boolean;
  /** Hull plates for the fleet (crystals instead while the drydock is shut). */
  plates?: number;
}

export interface VisitChoice {
  label: string;
  /** Crystals the answer costs, if any. */
  pay?: number;
  give: VisitReward;
  reply: string;
}

export interface VisitRequest {
  ask: string;
  a: VisitChoice;
  b: VisitChoice;
  /** The answer the visitor hoped for. */
  likes: 'a' | 'b';
}

export interface VisitorDef {
  id: VisitorId;
  name: string;
  title: string;
  look: CrewDef['look'];
  /** Shuttle colour. */
  color: number;
  /** Shown in the guestbook once met: a hint at what wins them over. */
  likes: string;
  keepsake: { name: string; stat: keyof Bonuses; amount: number; text: string };
  requests: readonly VisitRequest[];
}

export const VISITS = {
  /** Minutes of play before the first visitor, and the gap between visits. */
  firstMin: 15,
  gap: [22, 40] as [number, number],
  /** How long a shuttle waits at the dock before it leaves. */
  stayMin: 5,
  /** Hearts to become a friend and leave the keepsake. */
  hearts: 3,
};

const look = (skin: string, hair: string, suit: string, style: CrewDef['look']['style']): CrewDef['look'] => ({ skin, hair, suit, visor: '#eef', style });

export const VISITORS: readonly VisitorDef[] = [
  {
    id: 'quill', name: 'Professor Quill', title: 'Comet scholar', color: 0x9fe0ff, look: look('#d9a27e', '#e8e8f0', '#5c7cff', 'bob'),
    likes: 'Curiosity. Ask questions, share the sky.',
    keepsake: { name: 'Quill’s star chart', stat: 'golden', amount: 0.2, text: 'Golden scrap turns up 20% more often.' },
    requests: [
      {
        ask: 'Comet 7Q passes tonight! Might I borrow your telescope for an hour?',
        a: { label: 'Of course, take your time', give: { crystals: 4 }, reply: 'Splendid! I’ll name a crater after your station.' },
        b: { label: 'Only if we keep the data', give: { scrapMin: 20 }, reply: 'Hm. Fair. Science is a trade, I suppose.' },
        likes: 'a',
      },
      {
        ask: 'I found this rock in your debris. It hums. Would you sell it?',
        a: { label: 'Take it, for 6 crystals', pay: 6, give: { scrapMin: 45 }, reply: 'A bargain! Here, a finder’s fee from my grant.' },
        b: { label: 'Tell me what it is first', give: { crystals: 3 }, reply: 'Ah, you’re curious! A singing geode. Keep it. Listen at night.' },
        likes: 'b',
      },
      {
        ask: 'My shuttle’s star tracker is fogged. Could your crew clean it?',
        a: { label: 'We’ll give it a polish', give: { crystals: 3 }, reply: 'Crystal clear! I can see three new moons.' },
        b: { label: 'Show us how it works', give: { scrapMin: 15, crystals: 2 }, reply: 'Gladly! Gather round, everyone, lens first…' },
        likes: 'b',
      },
    ],
  },
  {
    id: 'juniper', name: 'Juniper Vale', title: 'Wandering botanist', color: 0x9dff6b, look: look('#8d5a3b', '#4a8f2a', '#6fcf7a', 'bun'),
    likes: 'Kindness to growing things. And slow mornings.',
    keepsake: { name: 'A pot of starmoss', stat: 'offline', amount: 0.25, text: 'Time away earns 25% more.' },
    requests: [
      {
        ask: 'My moss needs a little starlight. Can it sit by your windows a while?',
        a: { label: 'Make yourselves at home', give: { crystals: 4 }, reply: 'It’s purring. Moss purrs, you know. Quietly.' },
        b: { label: 'Rent a window for scrap', give: { scrapMin: 25 }, reply: 'Oh. Well. Business is business, I suppose.' },
        likes: 'a',
      },
      {
        ask: 'I have seeds to swap. Space beans or comet melons?',
        a: { label: 'Space beans, please', give: { bait: 2 }, reply: 'Beans! Good fish bait too, between you and me.' },
        b: { label: 'Comet melons!', give: { surge: 60 }, reply: 'Juicy choice. They glow a bit. That’s normal.' },
        likes: 'a',
      },
      {
        ask: 'Your crew looks tired. Want me to brew my sleepy-leaf tea?',
        a: { label: 'Yes, everyone takes a break', give: { scrapMin: 10, crystals: 3 }, reply: 'There. Slow sips. The scrap will wait.' },
        b: { label: 'No time, we’re salvaging', give: { overdrive: true }, reply: 'Then take this fizzy one. For emergencies only!' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'brass', name: 'Brass', title: 'Retired mining robot', color: 0xffb547, look: look('#b8bcd0', '#6a7090', '#ffb547', 'helmet'),
    likes: 'Hard work and honest numbers. Beep.',
    keepsake: { name: 'Brass’s old drill bit', stat: 'tap', amount: 0.25, text: 'Taps are worth 25% more.' },
    requests: [
      {
        ask: 'BEEP. MY JOINTS SQUEAK. DO YOU HAVE OIL. I CAN PAY IN ROCKS.',
        a: { label: 'Oil’s on the house', give: { crystals: 3 }, reply: 'GRATITUDE.EXE. THE ROCKS ARE YOURS ANYWAY.' },
        b: { label: 'Rocks first, then oil', give: { scrapMin: 30 }, reply: 'FAIR TRADE DETECTED. RESPECT +1.' },
        likes: 'b',
      },
      {
        ask: 'I CAN MINE YOUR BIGGEST ASTEROID. 100% EFFICIENCY. OR RACE YOUR CLAW.',
        a: { label: 'Mine the asteroid', give: { scrapMin: 40 }, reply: 'DRILLING. DRILLING. DONE. EXCELLENT ROCK.' },
        b: { label: 'Race the claw!', give: { surge: 90 }, reply: 'YOU WON. I LET YOU. NO I DID NOT. REMATCH.' },
        likes: 'a',
      },
      {
        ask: 'I HAVE COUNTED YOUR BOLTS. YOU HAVE 4,112. ONE IS LOOSE. FIX?',
        a: { label: 'Please fix it', give: { crystals: 4 }, reply: 'TIGHTENED. YOUR STATION IS NOW 0.02% SAFER.' },
        b: { label: 'Leave it, it’s lucky', give: { bait: 2 }, reply: 'LUCK IS NOT A UNIT. …I WILL ALLOW IT.' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'nana', name: 'Nana Okoro', title: 'Courier, 60 years flying', color: 0xff8fa8, look: look('#5e3a28', '#dcdcdc', '#ff8fa8', 'bun'),
    likes: 'Good manners, and a full belly.',
    keepsake: { name: 'A hand-knitted scarf', stat: 'income', amount: 0.1, text: '+10% income.' },
    requests: [
      {
        ask: 'Parcel for your station, dear. Shall I bring it in, or will you sign out here?',
        a: { label: 'Come in for cocoa', give: { crystals: 4 }, reply: 'Oh, how lovely. Marshmallows too? You spoil me.' },
        b: { label: 'Sign and go, thanks', give: { scrapMin: 25 }, reply: 'Busy busy. Don’t forget to eat something.' },
        likes: 'a',
      },
      {
        ask: 'I baked too many star buns. Do you want them, or should I sell them at the next dock?',
        a: { label: 'Sell them, you earned it', give: { scrapMin: 15 }, reply: 'Hmph. Well. I’ll leave a few on the counter anyway.' },
        b: { label: 'We’ll take them all!', pay: 4, give: { surge: 120 }, reply: 'That’s my crew! Eat them warm.' },
        likes: 'b',
      },
      {
        ask: 'My old route passes a scrap drift. Shall I tow some your way?',
        a: { label: 'Yes please, Nana', give: { scrapMin: 35 }, reply: 'It’s on its way. Say thank you to the drift.' },
        b: { label: 'Don’t trouble yourself', give: { crystals: 2 }, reply: 'Trouble? Pfft. But it’s sweet of you.' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'ziggy', name: 'Ziggy Flux', title: 'Asteroid racer', color: 0xff5d6c, look: look('#f5d0b5', '#ff4fd8', '#ff5d6c', 'spiky'),
    likes: 'Speed, noise and a good show.',
    keepsake: { name: 'Ziggy’s lucky dice', stat: 'boss', amount: 0.3, text: '+30% damage to boss wrecks.' },
    requests: [
      {
        ask: 'Pit stop! Fill me up and I’ll do a loop round your station. Deal?',
        a: { label: 'Do the loop!', give: { overdrive: true }, reply: 'WOOOO! Did you see that? Your drones did!' },
        b: { label: 'Just the fuel, thanks', give: { scrapMin: 20 }, reply: 'Boring! …but thanks for the fuel.' },
        likes: 'a',
      },
      {
        ask: 'Bet you 5 crystals my ship beats your fastest drone round the ring.',
        a: { label: 'You’re on!', pay: 5, give: { crystals: 12 }, reply: 'Your drone CHEATED. I love it. Here’s your winnings.' },
        b: { label: 'We don’t gamble', give: { crystals: 2 }, reply: 'Suit yourself, captain sensible.' },
        likes: 'a',
      },
      {
        ask: 'Need a sponsor sticker on my hull. Your station’s logo? Free advertising!',
        a: { label: 'Make it big and loud', give: { crystals: 4 }, reply: 'Done! Now everyone knows where the scrap is.' },
        b: { label: 'Something tasteful', give: { scrapMin: 20 }, reply: 'Tasteful. Ugh. Fine. It’s very small.' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'wick', name: 'Wick', title: 'Lighthouse keeper', color: 0xffe9a8, look: look('#e0ac86', '#6b4a2a', '#ffe9a8', 'buzz'),
    likes: 'Quiet company and stories about the dark.',
    keepsake: { name: 'A spare lighthouse lamp', stat: 'trip', amount: 0.2, text: 'Expeditions finish 20% faster.' },
    requests: [
      {
        ask: 'My beacon buoy needs a new bulb. Got a spare, or should I wait for the supply run?',
        a: { label: 'Take one of ours', give: { crystals: 3 }, reply: 'You’ve kept a dozen ships off the rocks tonight.' },
        b: { label: 'Trade it for your charts', give: { bait: 3 }, reply: 'Charts of the fishing grounds. Good ones.' },
        likes: 'a',
      },
      {
        ask: 'Sit with me a minute? I like to watch the traffic go by.',
        a: { label: 'Sit and watch', give: { crystals: 3, scrapMin: 5 }, reply: '…That one’s a grain barge. Late again. Thanks, captain.' },
        b: { label: 'Sorry, too busy', give: { scrapMin: 20 }, reply: 'Of course. The lamp will be here.' },
        likes: 'a',
      },
      {
        ask: 'I hear things on my watch. Want to hear about the ghost freighter?',
        a: { label: 'Yes! Tell me everything', give: { crystals: 4 }, reply: 'It only shows on the night of a new moon. Its lights are… amber.' },
        b: { label: 'Maybe another time', give: { surge: 60 }, reply: 'Another time, then. Sleep with a light on.' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'sal', name: 'Sal Marrow', title: 'Junk collector', color: 0xc58cff, look: look('#c68c64', '#2a2060', '#c58cff', 'spiky'),
    likes: 'A sharp deal. Never pay full price.',
    keepsake: { name: 'Sal’s best wrench', stat: 'income', amount: 0.1, text: '+10% income.' },
    requests: [
      {
        ask: 'Your bins are full of perfectly good junk. Sell it to me cheap?',
        a: { label: 'Fine, cheap it is', give: { scrapMin: 15 }, reply: 'Pleasure doing business. Mostly my pleasure.' },
        b: { label: 'Haggle hard', give: { crystals: 5 }, reply: 'Ha! You’re good. Fine. FINE.' },
        likes: 'b',
      },
      {
        ask: 'Got a crate of mystery parts. 4 crystals and it’s yours, no peeking.',
        a: { label: 'Buy the mystery crate', pay: 4, give: { scrapMin: 50 }, reply: 'Told you. Never a dud from Sal.' },
        b: { label: 'Offer 2 crystals', pay: 2, give: { scrapMin: 20 }, reply: 'Ooh, cheeky. Half the crate for half the price.' },
        likes: 'b',
      },
      {
        ask: 'Need somewhere to stash my stuff for a bit. No questions?',
        a: { label: 'No questions', give: { crystals: 4 }, reply: 'Good captain. Very good captain.' },
        b: { label: 'One question: what’s in it?', give: { bait: 2 }, reply: 'Worms. Space worms. Excellent bait. Have some.' },
        likes: 'a',
      },
    ],
  },
  {
    id: 'ember', name: 'Ember', title: 'Last pilot of the Hollow Fleet', color: 0xff8a4c, look: look('#a8714d', '#c0462e', '#ff8a4c', 'helmet'),
    likes: 'The old fleet. Honour it, and she’ll trust you.',
    keepsake: { name: 'A Hollow Fleet medal', stat: 'income', amount: 0.15, text: '+15% income.' },
    requests: [
      {
        ask: 'You’re salvaging Hollow Fleet wrecks. My fleet. Will you mark them before you cut?',
        a: { label: 'We’ll paint the circle on each', give: { crystals: 4, plates: 2 }, reply: '…Thank you. That means more than you know.' },
        b: { label: 'Scrap is scrap', give: { scrapMin: 30 }, reply: 'I suppose it is. To you.' },
        likes: 'a',
      },
      {
        ask: 'I found my old ship’s bell in your hold. Can I have it back?',
        a: { label: 'It’s yours, of course', give: { crystals: 5 }, reply: 'It still rings true. Like the day we left home.' },
        b: { label: 'Swap it for a story', give: { scrapMin: 15, crystals: 2 }, reply: 'A story, then. We left with forty ships and one song…' },
        likes: 'a',
      },
      {
        ask: 'The fleet flew in formation once. Want to see how we did it?',
        a: { label: 'Show the drones', give: { surge: 90 }, reply: 'Wing to wing. See? Like geese, but braver.' },
        b: { label: 'Write it down for later', give: { plates: 3, crystals: 2 }, reply: 'Here. Every pattern we ever flew.' },
        likes: 'a',
      },
    ],
  },
];

export const visitorDef = (id: string) => VISITORS.find((v) => v.id === id);

export const hearts = (state: GameState, id: VisitorId): number => state.visitors.hearts[id] ?? 0;

export const isFriend = (state: GameState, id: VisitorId): boolean => hearts(state, id) >= VISITS.hearts;

/** Keepsake bonuses from every visitor who became a friend. */
export function keepsakeBonuses(state: GameState): [keyof Bonuses, number][] {
  return VISITORS.filter((v) => isFriend(state, v.id)).map((v) => [v.keepsake.stat, v.keepsake.amount]);
}

/** The visitor docked right now, if any (with their request). */
export function visitorHere(state: GameState, now: number): { def: VisitorDef; req: VisitRequest } | null {
  const h = state.visitors.here;
  if (!h || now >= h.until) return null;
  const def = visitorDef(h.id);
  const req = def?.requests[h.req % def.requests.length];
  return def && req ? { def, req } : null;
}

/**
 * Picks who docks next: a visitor not yet a friend if there is one (favouring whoever was met
 * least), and a request they haven't asked lately.
 */
export function pickVisitor(state: GameState, rand: () => number): { id: VisitorId; req: number } {
  const pool = VISITORS.filter((v) => !isFriend(state, v.id));
  const list = pool.length ? pool : VISITORS;
  // Lightly favour the ones met least, but never the one who just left.
  const last = state.visitors.last;
  const weighted = list.filter((v) => v.id !== last || list.length === 1).flatMap((v) => Array(Math.max(1, 4 - (state.visitors.met[v.id] ?? 0))).fill(v) as VisitorDef[]);
  const def = weighted[Math.floor(rand() * weighted.length)];
  const met = state.visitors.met[def.id] ?? 0;
  return { id: def.id, req: met % def.requests.length };
}
