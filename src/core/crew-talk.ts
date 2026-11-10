import { CREW, type CrewId } from './content';

/**
 * What the crew say when they're tapped on the station, or now and then on their own.
 * Pure text picking, so the scene only has to show it.
 */

/** Why a line is wanted: a tap, a chat on their own, a new arrival, or a level up. */
export type TalkReason = 'poke' | 'idle' | 'hello' | 'levelup' | 'home';

export interface TalkContext {
  /** Deep night: most of the crew are asleep, so whoever answers is on night watch. */
  night: boolean;
  /** A boss wreck is on screen. */
  boss: boolean;
  /** The Frost Festival is on. */
  festival: boolean;
  /** This sector's name. */
  sector: string;
  /** This crew member's level (0 when not recruited yet: Mika, before she's hired). */
  level: number;
  /** Critters ever landed. */
  caught: number;
  /** How many crew are on the station with them. */
  aboard: number;
}

/** Each crew member's own lines, in their own voice. */
export const PERSONAL: Record<CrewId, readonly string[]> = {
  mika: [
    'The drones like it when you hum to them.',
    'I named drone forty-two Biscuit. Don\'t tell the others.',
    'Tap, tap, salvage! You\'re getting good at this.',
    'Every drone comes back. Well, nearly every drone.',
    'If you need me, I\'ll be counting propellers.',
    'Drone tip: they follow shiny things. So do I, honestly.',
  ],
  bolt: [
    'Towed a whole freighter in with one hand once. The other hand had a sandwich.',
    'Smooth flying today. Not a single dent. Yet.',
    'Haulers are just drones that went to the gym.',
    'Nothing beats a long tow with the radio on.',
    'Parking a hauler is ninety percent nerve.',
  ],
  ash: [
    'Furnace is toasty. I could bake bread in there.',
    'Melted down a fridge this morning. Very cool. Then very hot.',
    'Soot on my nose? Leave it, it\'s my look.',
    'Hotter is better. Within reason. Mostly.',
    'If it glows, I made it glow.',
  ],
  juno: [
    'Printed a spare bolt and a tiny hat. Guess which one I\'m prouder of.',
    'The printer hums in B flat. I tuned it.',
    'Measure twice, print once, print again for luck.',
    'I can print you anything. Within the build volume.',
    'Layer by layer, just like a cake.',
  ],
  hex: [
    'Dock ring\'s busy today. Everyone wants a parking spot.',
    'Rule one of the dock: no racing. Rule two: see rule one.',
    'I keep a list of every ship that docks. It\'s a long list.',
    'Berth seven has a squeaky clamp. I like it that way.',
    'Welcome aboard. Wipe your boots.',
  ],
  ray: [
    'Lasers charged! Point me at a rock.',
    'I never miss. The rocks just move.',
    'Pew pew. Sorry, I say that every time.',
    'Safety goggles on. Safety goggles always on.',
    'That asteroid looked at me funny.',
  ],
  nova: [
    'Gravity is just space giving you a hug.',
    'Careful near the wells, your snacks will float off.',
    'I bent a little spacetime earlier. It bent back.',
    'Up, down, sideways. It\'s all relative out here.',
    'The wells hum lower when they\'re happy.',
  ],
  pip: [
    'The swarm says hi. All eleven thousand of them.',
    'Nanites are tiny but they have big feelings.',
    'Shh, the swarm is napping in the vents.',
    'I taught the swarm to make a smiley face.',
    'Small things, working together. That\'s the trick.',
  ],
  orin: [
    'The gate shows a different star every time I look.',
    'Plotted a course to somewhere nobody has named yet.',
    'Every jump I hold my breath. Old habit.',
    'Navigation is just very confident guessing.',
    'Somewhere out there, the Fleet is still out there. I can feel it.',
  ],
  sol: [
    'The star is calm today. Good star.',
    'I sing to the panels so they catch more light.',
    'Sunlight is free. Best deal in the galaxy.',
    'A whole star working for us. Be nice to it.',
    'Warm hands, warm heart, warm star.',
  ],
};

const NIGHT = [
  'Night watch. Everyone else is snoring.',
  'Quiet shift. Just me, the stars and a flask of tea.',
  'Shh. The whole station is asleep.',
  'I like the night shift. The stars are louder.',
];

const BOSS = [
  'Big wreck! Hit it, hit it!',
  'Look at the size of that thing!',
  'Go on, break it open!',
  'Tap faster! I believe in you!',
];

const FESTIVAL = [
  'Frost Festival! Somebody hang a bauble on my helmet.',
  'Is there cocoa left? Asking for me.',
  'Snow in space. Don\'t ask how. Just enjoy it.',
];

const GENERAL = [
  'Good shift so far, boss.',
  'Need anything? I\'m on it.',
  'The coffee machine is making that noise again.',
  'Lovely view from the deck today.',
];

const HELLO = [
  'Reporting for duty!',
  'Hi everyone! Where do I put my bags?',
  'Made it! Nice station you have here.',
];

const HOME = [
  'Back from the trip! Did you miss me?',
  'Home sweet station.',
  'What a trip. I brought you a rock. It\'s a nice rock.',
];

const LEVEL = [
  'Level up! I feel taller.',
  'Training paid off. Watch this!',
  'New skills unlocked. Mostly confidence.',
];

/** Picks one of `list` with `rnd`. */
function pick<T>(list: readonly T[], rnd: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

/** A line for crew member `id` to say, given what's going on. */
export function crewLine(id: CrewId, why: TalkReason, ctx: TalkContext, rnd: () => number = Math.random): string {
  if (why === 'hello') return pick(HELLO, rnd);
  if (why === 'home') return pick(HOME, rnd);
  if (why === 'levelup') return pick(LEVEL, rnd);
  if (ctx.boss) return pick(BOSS, rnd);
  if (ctx.night) return pick(NIGHT, rnd);
  const extra: string[] = [];
  if (ctx.festival) extra.push(...FESTIVAL);
  extra.push(`${ctx.sector}. Not bad, as sectors go.`);
  if (ctx.caught > 0) extra.push(`${ctx.caught === 1 ? 'One critter' : `${ctx.caught} critters`} in the book. Keep fishing!`);
  if (ctx.aboard <= 1) extra.push('Bit lonely on deck. Maybe hire some friends?');
  else if (ctx.aboard >= 6) extra.push('The deck is getting crowded. I love it.');
  if (id === 'mika' && ctx.level === 0) extra.push('Recruit me in the Crew tab and the drones work twice as hard!');
  // Mostly their own voice; now and then something about what's around them.
  return rnd() < 0.62 ? pick(PERSONAL[id], rnd) : pick([...extra, ...GENERAL], rnd);
}

/** The display name of a crew member. */
export function crewName(id: CrewId): string {
  return CREW.find((c) => c.id === id)?.name ?? id;
}
