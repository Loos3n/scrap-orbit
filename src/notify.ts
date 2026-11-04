import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CREW, RESEARCH } from './core/content';
import { baseIncome, offlineCapSec } from './core/economy';
import type { GameState } from './core/state';

/*
 * Phone notifications for the Android app (nothing happens on the web). When the app goes to
 * the background we schedule a few reminders from the save: offline storage filling up, research
 * finishing and crew coming home. Coming back cancels them all.
 */

const native = () => Capacitor.isNativePlatform();
const IDS = { storage: 1, research: 2, trip: 3 };

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
