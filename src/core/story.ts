import type { CrewDef, CrewId } from './content';
import type { GameState } from './state';

/*
 * The Hollow Fleet: the story the radio tells. Forty ships left a dying sun three hundred years
 * ago, their holds hollowed out to carry everyone. The wrecks the station salvages are theirs.
 * One ship, the Lantern, is still out there with its sleepers, and its beacon leads the station
 * across sectors and galaxies until, in the third galaxy, the Lantern docks for good.
 *
 * Each transmission unlocks once the one before it has been heard and its moment is reached.
 * Hearing one pays a few crystals; the last one docks the Lantern for a lasting bonus.
 * This file only reads the save; Game.hearStory writes it.
 */

/** Who speaks a line: a crew member, a guest from the Lantern, or an unknown voice. */
export type Speaker = CrewId | 'vey' | 'tam' | 'radio';

export interface StoryLine {
  who: Speaker;
  text: string;
}

export interface StoryEntry {
  id: string;
  /** Index into CHAPTERS. */
  chapter: number;
  title: string;
  /** What the player does to reach it, shown in the radio log while it's still ahead. */
  hint: string;
  when: (s: GameState) => boolean;
  lines: StoryLine[];
}

export const CHAPTERS = ['Static', 'The Charts', 'The Home That Wasn’t', 'Other Stars', 'The Lantern'] as const;

/** Crystals for each transmission heard, and for the last. */
export const STORY_CRYSTALS = 3;
export const FINALE_CRYSTALS = 50;
/** Income added for good once the Lantern docks. */
export const FINALE_INCOME = 0.5;
export const FINALE_ID = 'home';

/** The two voices from the Lantern, drawn like the crew (ui/portrait.ts). */
export const GUESTS: Record<'vey' | 'tam' | 'radio', Pick<CrewDef, 'name' | 'role' | 'look'>> = {
  vey: { name: 'Captain Vey', role: 'The Lantern', look: { skin: '#b9825c', hair: '#d8d4e8', suit: '#ffb547', visor: '#ffe', style: 'bob' } },
  tam: { name: 'Tamsin', role: 'The Lantern', look: { skin: '#f0c4a0', hair: '#c0462e', suit: '#ff8fa8', visor: '#fde', style: 'bun' } },
  radio: { name: 'Unknown signal', role: 'Emergency band', look: { skin: '#3a3f6a', hair: '#3a3f6a', suit: '#5a6090', visor: '#889', style: 'helmet' } },
};

const L = (who: Speaker, text: string): StoryLine => ({ who, text });

export const STORY: readonly StoryEntry[] = [
  // ---------- Chapter 1: Static ----------
  {
    id: 'static',
    chapter: 0,
    title: 'Something on the old band',
    hint: 'Keep salvaging for a few minutes.',
    when: (s) => s.tutorial < 0 && s.stats.playSec >= 180,
    lines: [
      L('radio', '…kkhh… any station… this is… kssh… Lantern… do you read…'),
      L('mika', 'Captain, did you hear that? Something on the old emergency band.'),
      L('mika', 'And it’s gone. Probably a passing wreck’s beacon. Probably.'),
    ],
  },
  {
    id: 'insignia',
    chapter: 0,
    title: 'The hollow circle',
    hint: 'Break a boss wreck.',
    when: (s) => s.stats.bosses >= 1,
    lines: [
      L('hex', 'Captain, the wreck we just broke up had this painted on its flank. A hollow circle.'),
      L('hex', 'Same mark as half the junk in this belt. Whoever they were, there were a lot of them.'),
      L('radio', '…kssh… Hollow Fleet… flagship Lantern… still… can anyone…'),
      L('mika', 'Hollow Fleet! That’s the name on the signal.'),
    ],
  },
  {
    id: 'beacon',
    chapter: 0,
    title: 'Follow the beacon',
    hint: 'Relocate the station.',
    when: (s) => s.stats.relocations >= 1,
    lines: [
      L('mika', 'New sector, and the signal’s clearer out here.'),
      L('radio', 'This is the Lantern. Our engines are cold and we are drifting. If anyone hears this, follow the beacon.'),
      L('bolt', 'There are coordinates buried in the static. Way, way out. We’d have to keep jumping.'),
      L('mika', 'Then we keep jumping. Someone’s out there, Captain.'),
    ],
  },
  // ---------- Chapter 2: The Charts ----------
  {
    id: 'log',
    chapter: 1,
    title: 'Captain’s log',
    hint: 'Make 2 jumps.',
    when: (s) => s.stats.relocations >= 2,
    lines: [
      L('juno', 'I printed out the memory core from that last wreck. It’s a ship’s log, three hundred years old!'),
      L('vey', 'Captain’s log, Ilsa Vey. The Hollow Fleet leaves today: forty ships, their holds emptied out to carry everyone.'),
      L('vey', 'Our sun is fading. Somewhere out there is a home. We will find it.'),
      L('juno', 'Hollow… because they hollowed out their ships to carry people. Oh.'),
    ],
  },
  {
    id: 'storm',
    chapter: 1,
    title: 'The storm',
    hint: 'Make 4 jumps.',
    when: (s) => s.stats.relocations >= 4,
    lines: [
      L('vey', 'Log, year eleven. A storm scattered the fleet. We lost sight of the Ark and half the convoy.'),
      L('ash', 'Captain… the wrecks we’ve been melting down. They’re the fleet’s ships.'),
      L('mika', 'Nobody was aboard. They got everyone across in time. The log says so.'),
      L('vey', 'The Lantern carries the sleepers now. We will keep the light on for the others.'),
    ],
  },
  {
    id: 'pod',
    chapter: 1,
    title: 'A message in the ice',
    hint: 'Make 6 jumps.',
    when: (s) => s.stats.relocations >= 6,
    lines: [
      L('nova', 'Captain, there’s a little message buoy frozen in the ice out here. It still has power.'),
      L('tam', 'Hi. My name’s Tamsin and I’m eight. Mum says I can record a message in case someone finds the buoy.'),
      L('tam', 'We’re on the Lantern and we’re going to sleep for a long time. If you find this, please come and wake us up. Bye!'),
      L('nova', 'It’s from the Lantern. That kid’s still out there, asleep.'),
      L('mika', 'Then we’re going to wake her up.'),
    ],
  },
  // ---------- Chapter 3: The Home That Wasn't ----------
  {
    id: 'city',
    chapter: 2,
    title: 'Half a city',
    hint: 'Make 7 jumps.',
    when: (s) => s.stats.relocations >= 7,
    lines: [
      L('hex', 'Captain. These aren’t just wrecks. It’s a city. Half built, then left.'),
      L('vey', 'Log, year forty. We found a world and began to build. Then the ground shook and the sky caught fire. We left again.'),
      L('hex', 'They were so close.'),
    ],
  },
  {
    id: 'edge',
    chapter: 2,
    title: 'Past the dark star',
    hint: 'Make 8 jumps.',
    when: (s) => s.stats.relocations >= 8,
    lines: [
      L('vey', 'Log, last entry. The Lantern is the only ship left, and the dark star is pulling us in…'),
      L('orin', 'The beacon isn’t coming from inside the hole. It’s coming from past it. From another galaxy.'),
      L('orin', 'They slingshot round the edge and made it out. They’re just very, very far away.'),
      L('mika', 'Then we need a Dyson Collector and a whole new galaxy, Captain.'),
    ],
  },
  // ---------- Chapter 4: Other Stars ----------
  {
    id: 'shift',
    chapter: 3,
    title: 'We hear you',
    hint: 'Make a Galaxy Shift.',
    when: (s) => s.galaxy.shifts >= 1,
    lines: [
      L('sol', 'New galaxy, new stars. And the beacon is loud as a bell out here.'),
      L('vey', '…is someone following us? Our sensors are old. If you’re real, we hear you.'),
      L('vey', 'The Lantern’s reactor is failing. The sleepers have a few years left. Please hurry.'),
      L('mika', 'Hold on, Captain Vey. We’re coming.'),
    ],
  },
  {
    id: 'heart',
    chapter: 3,
    title: 'A new heart',
    hint: 'Build a Dyson Collector in your second galaxy.',
    when: (s) => s.galaxy.shifts >= 1 && s.owned.dyson >= 1,
    lines: [
      L('sol', 'We can’t tow a ship that size yet. But we can beam it what it needs.'),
      L('juno', 'Reactor parts! Give me enough scrap and I’ll print the Lantern a whole new heart.'),
      L('vey', 'We felt that. Warm air in the corridors for the first time in a century. Thank you.'),
    ],
  },
  {
    id: 'biscuit',
    chapter: 3,
    title: 'Biscuit',
    hint: 'Hold 25 Star Cores in your second galaxy.',
    when: (s) => s.galaxy.shifts >= 1 && s.cores >= 25,
    lines: [
      L('tam', 'Hello? Mum says I’m allowed on the radio now. Are you the ones with the scrap station?'),
      L('tam', 'Do you have a cat? We had a cat. She’s asleep too. Her name is Biscuit.'),
      L('mika', 'We’ll save Biscuit the warmest spot on the station. Promise.'),
    ],
  },
  // ---------- Chapter 5: The Lantern ----------
  {
    id: 'light',
    chapter: 4,
    title: 'A light ahead',
    hint: 'Shift to a third galaxy.',
    when: (s) => s.galaxy.shifts >= 2,
    lines: [
      L('orin', 'There. On the long-range scope. A light.'),
      L('vey', 'We see you. After three hundred years, we see you.'),
      L('sol', 'She’s too big to tow on what we have. We’ll need the full power of a star.'),
    ],
  },
  {
    id: FINALE_ID,
    chapter: 4,
    title: 'Home',
    hint: 'Build a Dyson Collector in your third galaxy.',
    when: (s) => s.galaxy.shifts >= 2 && s.owned.dyson >= 1,
    lines: [
      L('sol', 'The Dyson’s online. That’s enough power to tow her. Bringing the Lantern alongside.'),
      L('vey', 'Lantern to station: docking clamps locked. Waking the sleepers now.'),
      L('tam', 'Is it morning? MUM, IS IT MORNING?'),
      L('vey', 'Three hundred years we looked for a home. I think we found one. Not a world. A station full of friends.'),
      L('mika', 'Welcome home, Hollow Fleet.'),
    ],
  },
];

export const storyHeard = (s: GameState, id: string) => s.story.heard.has(id);

/** Transmissions ready to play: unlocked, not heard yet, in order (each waits for the one before). */
export function pendingStory(s: GameState): StoryEntry | null {
  for (const e of STORY) {
    if (s.story.heard.has(e.id)) continue;
    return e.when(s) ? e : null;
  }
  return null;
}

/** The next transmission still ahead, if every earlier one has been heard. */
export function nextStory(s: GameState): StoryEntry | null {
  return STORY.find((e) => !s.story.heard.has(e.id)) ?? null;
}

/** Whether the Lantern has docked: the story is over. */
export const storyDone = (s: GameState) => s.story.heard.has(FINALE_ID);

/** The radio shows up once the first transmission comes in. */
export const radioOpen = (s: GameState) => s.story.heard.size > 0 || pendingStory(s) !== null;

/** Income the docked Lantern adds, as a fraction. */
export const storyIncome = (s: GameState) => (storyDone(s) ? FINALE_INCOME : 0);
