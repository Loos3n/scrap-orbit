/*
 * The menu has five tabs along its top. A tab that holds more than one pane shows a segment bar
 * at the top of the sheet, all in the same style: Build has Machines and Upgrades, Crew has Crew,
 * Trips and Pets, Prestige has Star Cores, Challenges and the Galaxy, Station has Rooms and Decor.
 * Each pane keeps its own `tab-<pane>` element.
 */

export const GROUPS: Record<string, readonly string[]> = {
  build: ['build', 'upgrades'],
  crew: ['crew', 'trips', 'pets'],
  lab: ['lab'],
  prestige: ['cores', 'challenges', 'galaxy'],
  station: ['station', 'decor'],
};

export const GROUP_NAMES: Record<string, string> = { build: 'Build', crew: 'Crew', lab: 'Lab', prestige: 'Prestige', station: 'Station' };
export const PANE_NAMES: Record<string, string> = {
  build: 'Machines',
  upgrades: 'Upgrades',
  crew: 'Crew',
  trips: 'Trips',
  pets: 'Pets',
  lab: 'Lab',
  cores: 'Cores',
  challenges: 'Challenges',
  galaxy: 'Galaxy',
  station: 'Rooms',
  decor: 'Decor',
};

export const ALL_PANES = Object.values(GROUPS).flat();

/** The tab that holds a pane. */
export function groupOf(pane: string): string {
  return Object.keys(GROUPS).find((g) => GROUPS[g].includes(pane)) ?? 'build';
}

function groupOpen(group: string): boolean {
  const tab = document.querySelector(`.tab[data-tab="${group}"]`);
  return tab?.getAttribute('aria-selected') === 'true' && !document.getElementById('app')!.classList.contains('panel-closed');
}

const menuHidden = () => document.getElementById('app')!.classList.contains('panel-closed');

/** What to point at to reach a pane: the menu square while the menu is hidden, then its tab, then its segment button. */
export function paneTarget(pane: string): string {
  if (menuHidden()) return '#menu-btn';
  const group = groupOf(pane);
  return groupOpen(group) && GROUPS[group].length > 1 ? `.pane-seg button[data-pane="${pane}"]` : `.tab[data-tab="${group}"]`;
}

/** How to ask the player to open a pane. */
export function paneHint(pane: string): string {
  const group = groupOf(pane);
  if (menuHidden()) return GROUPS[group].length === 1 || GROUPS[group][0] === pane ? `Tap the menu square, then ${GROUP_NAMES[group]}.` : `Tap the menu square, then ${GROUP_NAMES[group]} and ${PANE_NAMES[pane]}.`;
  if (GROUPS[group].length === 1) return `Open the ${GROUP_NAMES[group]} tab.`;
  return groupOpen(group) ? `Tap ${PANE_NAMES[pane]} at the top.` : `Open the ${GROUP_NAMES[group]} tab, then ${PANE_NAMES[pane]}.`;
}
