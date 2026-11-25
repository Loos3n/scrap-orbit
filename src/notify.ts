import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CREW, RESEARCH } from './core/content';
import { baseIncome, offlineCapSec } from './core/economy';
import type { GameState } from './core/state';
import { WHALE, hatchAt } from './core/whale';
import { currentProject, pathText } from './core/planet';
import { plotCount, plotState } from './core/garden';
import { shipDef } from './core/fleet';

/*
 * Phone notifications for the Android app (nothing happens on the web). When the app goes to
 * the background we schedule a few reminders from the save: offline storage filling up, research
 * finishing, crew coming home, the whale's egg hatching or the whale going hungry, a planet
 * project taking hold, the garden ripening and a ship leaving the drydock. Coming back cancels
 * them all.
 */

const native = () => Capacitor.isNativePlatform();
const IDS = { storage: 1, research: 2, trip: 3, whale: 4, planet: 5, garden: 6, ship: 7 };

export const notificationsAvailable = native;

/** Asks the phone for permission. Returns whether notifications may be shown. */
export async function askPermission(): Promise<boolean> {
  if (!native()) return false;
  try {
    const now = await LocalNotifications.checkPermissions();
    if (now.display === 'granted') return true;
    if (now.display === 'denied') return false;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** What to remind the player about, and when, if they leave now. Pure, so it can be tested. */
export function reminders(state: GameState, now: number): { id: number; at: number; title: string; body: string }[] {
  const out: { id: number; at: number; title: string; body: string }[] = [];
  const cap = offlineCapSec(state);
  if (state.tutorial < 0 && baseIncome(state).gt(0) && cap >= 1800) {
    out.push({ id: IDS.storage, at: now + cap * 1000, title: 'Scrap storage is full', body: 'Your station has stopped stacking scrap. Pop in to collect it and keep the machines busy.' });
  }
  const r = state.research.active;
  if (r && r.endsAt > now + 60_000) {
    const name = RESEARCH.find((x) => x.id === r.id)?.name ?? 'Research';
    out.push({ id: IDS.research, at: r.endsAt, title: 'Research complete', body: `${name} is ready in the Lab. Start the next project!` });
  }
  const trip = state.trips.filter((t) => t.endsAt > now + 60_000).sort((a, b) => a.endsAt - b.endsAt)[0];
  if (trip) {
    const who = CREW.find((c) => c.id === trip.crew)?.name ?? 'Your crew';
    out.push({ id: IDS.trip, at: trip.endsAt, title: `${who} is back`, body: `${who} came home from a trip with a haul to unpack.` });
  }
  const w = state.whale;
  if (w.phase === 'egg' && hatchAt(state) > now + 60_000) {
    out.push({ id: IDS.whale, at: hatchAt(state), title: 'The egg is hatching!', body: 'Something tiny is knocking from inside. Come and meet it.' });
  } else if (w.phase === 'born' && w.hunger < WHALE.mealsMax) {
    // Only once every bowl is empty, so a nap never turns into nagging.
    const at = w.hungerAt + (WHALE.mealsMax - w.hunger) * WHALE.mealEveryMin * 60_000;
    if (at > now + 60_000) out.push({ id: IDS.whale, at, title: `${w.name} is hungry`, body: `${w.name} is circling the station with a rumbling tummy. A meal keeps it happy (and keeps the bonus up).` });
  }
  const pr = currentProject(state);
  if (pr && state.planet.settleAt > now + 60_000) {
    const name = pathText(state, pr.name);
    out.push({ id: IDS.planet, at: state.planet.settleAt, title: `${name} took hold`, body: `Good news from ${state.planet.name}. The next project is ready for pods.` });
  }
  let ripe = 0;
  for (let i = 0; i < plotCount(state); i++) {
    const p = plotState(state, i, now);
    if (p.crop && !p.ripe && p.secondsLeft > 60) ripe = Math.max(ripe, now + p.secondsLeft * 1000);
  }
  if (ripe) out.push({ id: IDS.garden, at: ripe, title: 'The garden is ripe', body: 'Everything in the hydroponics bay is ready to pick. The crew are hungry for a snack.' });
  const job = state.fleet.job;
  if (job && job.endsAt > now + 60_000) {
    const ship = shipDef(job.ship)?.name ?? 'Your ship';
    out.push({ id: IDS.ship, at: job.endsAt, title: `${ship} is ready`, body: `${ship} is out of the drydock and waiting to join the fleet.` });
  }
  return out;
}

/** Schedules this save's reminders (call when the app is hidden). */
export async function scheduleReminders(state: GameState): Promise<void> {
  if (!native() || !state.settings.notifications) return;
  try {
    await cancelReminders();
    const list = reminders(state, Date.now());
    if (!list.length) return;
    await LocalNotifications.schedule({
      notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true } })),
    });
  } catch {
    // Permission not granted or the plugin is missing; the game carries on.
  }
}

export async function cancelReminders(): Promise<void> {
  if (!native()) return;
  try {
    await LocalNotifications.cancel({ notifications: Object.values(IDS).map((id) => ({ id })) });
  } catch {
    // Nothing scheduled.
  }
}
