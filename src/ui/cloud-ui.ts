import { cloudAvailable, download, signIn, signOut, upload, watchUser, type CloudSave } from '../cloud';
import { D, type Decimal } from '../core/num';
import { exportCode, importCode } from '../core/state';
import type { Game } from '../game';

const $ = (id: string) => document.getElementById(id)!;
/** How often a signed-in player's save is backed up while playing. Players can also back up any time. */
const BACKUP_MS = 60 * 60 * 1000;
/** Leaving the game backs up too, unless the last backup is this recent (keeps app switching cheap). */
const LEAVE_MS = 15 * 60 * 1000;

/**
 * Settings > Cloud save. Signing in looks for a save in the cloud: with none, this station is
 * backed up; with one further along, the player chooses which to keep. After that the save is
 * backed up every hour, and when the game goes to the background if the last backup is 15+ minutes old.
 */
export class CloudPanel {
  private signedIn = false;
  private lastBackup = 0;
  private busy = false;
  private pending: CloudSave | null = null;

  constructor(private game: Game, private fmt: (d: Decimal) => string) {
    if (!cloudAvailable()) return;
    $('cloud-box').hidden = false;
    $('cloud-signin').addEventListener('click', () => void this.run(() => this.signIn()));
    $('cloud-backup').addEventListener('click', () => void this.run(() => this.backup(true)));
    $('cloud-restore').addEventListener('click', () => void this.run(() => this.offerRestore()));
    $('cloud-signout').addEventListener('click', () => void this.run(async () => {
      await signOut();
      this.status('Signed out. Your station stays on this device.');
    }));
    $('cloud-use').addEventListener('click', () => this.useCloud());
    $('cloud-keep').addEventListener('click', () => void this.run(async () => {
      $('cloud-choice').hidden = true;
      this.pending = null;
      await this.backup(true);
    }));
    void watchUser((user) => {
      this.signedIn = !!user;
      $('cloud-signin').hidden = this.signedIn;
      for (const id of ['cloud-backup', 'cloud-restore', 'cloud-signout']) $(id).hidden = !this.signedIn;
      if (user) this.status(`Signed in as ${user.displayName || user.email || 'you'}. ${this.lastText()}`);
    });
    window.setInterval(() => void this.backup(false), 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.backup(false, true);
    });
  }

  private status(text: string): void {
    $('cloud-status').textContent = text;
  }

  private lastText(): string {
    if (!this.lastBackup) return 'Backs up every hour, or tap Back up now.';
    const min = Math.round((Date.now() - this.lastBackup) / 60_000);
    if (min < 1) return 'Backed up just now.';
    if (min < 90) return `Last backup ${min} min ago.`;
    return `Last backup ${Math.round(min / 60)} hours ago.`;
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } catch (e) {
      this.status(`Cloud save hit a snag: ${(e as Error).message || 'please try again'}.`);
    } finally {
      this.busy = false;
    }
  }

  private async signIn(): Promise<void> {
    this.status('Signing in…');
    await signIn();
    const cloud = await download();
    if (!cloud) {
      await this.backup(true);
      return;
    }
    // A cloud save further along than this one: let the player pick.
    if (D(cloud.allTime).gt(this.game.state.allTime)) this.ask(cloud);
    else await this.backup(true);
  }

  private async offerRestore(): Promise<void> {
    const cloud = await download();
    if (!cloud) {
      this.status('There is no cloud save yet. Back up now to make one.');
      return;
    }
    this.ask(cloud);
  }

  private ask(cloud: CloudSave): void {
    this.pending = cloud;
    const when = new Date(cloud.savedAt).toLocaleString();
    $('cloud-choice-text').textContent = `The cloud has a station from ${when} with ${this.fmt(D(cloud.allTime))} scrap salvaged (${cloud.relocations} relocations). This one has ${this.fmt(this.game.state.allTime)}. Which do you want to keep?`;
    $('cloud-choice').hidden = false;
  }

  private useCloud(): void {
    const cloud = this.pending;
    if (!cloud) return;
    const state = importCode(cloud.code, Date.now());
    if (!state) {
      this.status('That cloud save could not be read.');
      return;
    }
    $('cloud-choice').hidden = true;
    this.pending = null;
    this.game.load(state);
    this.lastBackup = Date.now();
    this.status('Cloud save loaded.');
  }

  /** Backs up when signed in: on demand, or when the last backup is old enough. */
  private async backup(force: boolean, leaving = false): Promise<void> {
    if (!this.signedIn || this.pending) return;
    const age = Date.now() - this.lastBackup;
    if (!force && age < (leaving ? LEAVE_MS : BACKUP_MS)) return;
    const s = this.game.state;
    try {
      await upload({ code: exportCode(s), savedAt: Date.now(), allTime: s.allTime.toString(), relocations: s.stats.relocations });
      this.lastBackup = Date.now();
      if (force) this.status(`Backed up. ${this.lastText()}`);
    } catch (e) {
      if (force) throw e;
    }
  }
}
