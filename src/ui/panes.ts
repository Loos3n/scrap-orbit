/*
 * The panel has four tabs in the bottom bar. Some tabs hold more than one pane, picked from a
 * segment bar at the top of the sheet: Build has Machines and Upgrades, Progress has the Lab,
 * Star Cores and the Galaxy. Each pane keeps its own `tab-<pane>` element.
 */

export const GROUPS: Record<string, readonly string[]> = {
  build: ['build', 'upgrades'],
  crew: ['crew'],
  progress: ['lab', 'cores', 'galaxy'],
  station: ['station'],
};

export const GROUP_NAMES: Record<string, string> = { build: 'Build', crew: 'Crew', progress: 'Progress', station: 'Station' };
export const PANE_NAMES: Record<string, string> = { build: 'Machines', upgrades: 'Upgrades', crew: 'Crew', lab: 'Lab', cores: 'Cores', galaxy: 'Galaxy', station: 'Station' };

export const ALL_PANES = Object.values(GROUPS).flat();

/** The tab that holds a pane. */
export function groupOf(pane: string): string {
  return Object.keys(GROUPS).find((g) => GROUPS[g].includes(pane)) ?? 'build';
}

function groupOpen(group: string): boolean {
  const tab = document.querySelector(`.tab[data-tab="${group}"]`);
  return tab?.getAttribute('aria-selected') === 'true' && !document.getElementById('app')!.classList.contains('panel-closed');
}

/** What to point at to reach a pane: its segment button once its tab is open, otherwise the tab. */
export function paneTarget(pane: string): string {
  const group = groupOf(pane);
  return groupOpen(group) && GROUPS[group].length > 1 ? `.pane-seg button[data-pane="${pane}"]` : `.tab[data-tab="${group}"]`;
}

/** How to ask the player to open a pane. */
export function paneHint(pane: string): string {
  const group = groupOf(pane);
  if (GROUPS[group].length === 1) return `Open the ${GROUP_NAMES[group]} tab.`;
  return groupOpen(group) ? `Tap ${PANE_NAMES[pane]} at the top.` : `Open the ${GROUP_NAMES[group]} tab, then ${PANE_NAMES[pane]}.`;
}
