import { cloudAvailable, download, signIn, signOut, upload, watchUser, type CloudSave } from '../cloud';
import { D, type Decimal } from '../core/num';
import { exportCode, importCode } from '../core/state';
import type { Game } from '../game';

const $ = (id: string) => document.getElementById(id)!;
/** How often a signed-in player's save is backed up while playing. Players can also back up any time. */
const BACKUP_MS = 60 * 60 * 1000;
/** Remembers on this device that the first-time cloud save invite was shown. */
const ASK_KEY = 'scrap-orbit.cloudAsked';
/** How long a session runs before the invite can appear, so it never greets a player on launch. */
const ASK_AFTER_MS = 20_000;

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
  /** True once Firebase has said whether someone is signed in. */
  private authKnown = false;
  /**
   * True once this session has compared the local save with the cloud. Until then nothing is
   * uploaded, so a device opened with an older station never overwrites newer cloud progress.
   */
  private synced = false;
  private readonly openedAt = Date.now();
  /** "Keep this one" was tapped once and waits for the confirming tap. */
  private keepArmed = false;

  constructor(private game: Game, private fmt: (d: Decimal) => string) {
    if (!cloudAvailable()) return;
    $('cloud-box').hidden = false;
    $('cloud-signin').addEventListener('click', () => void this.run(() => this.signIn()));
    $('cloud-backup').addEventListener('click', () => void this.run(() => (this.synced ? this.backup(true) : this.compare(true).then(() => undefined))));
    $('cloud-restore').addEventListener('click', () => void this.run(() => this.offerRestore()));
    $('cloud-signout').addEventListener('click', () => void this.run(async () => {
      await signOut();
      this.status('Signed out. Your station stays on this device.');
    }));
    $('cloud-use').addEventListener('click', () => this.useCloud());
    // Keeping this station replaces the cloud copy for good, so it takes a second tap to confirm.
    const keep = $('cloud-keep');
    keep.addEventListener('click', () => {
      if (!this.keepArmed) {
        this.keepArmed = true;
        keep.textContent = 'Tap again to replace the cloud save';
        return;
      }
      void this.run(async () => {
        $('cloud-choice').hidden = true;
        this.pending = null;
        this.synced = true;
        await this.backup(true);
      });
    });
    void watchUser((user) => {
      this.authKnown = true;
      const wasSignedIn = this.signedIn;
      this.signedIn = !!user;
      if (!user) this.synced = false;
      // Already signed in when the game opened: check the cloud before backing anything up.
      else if (!wasSignedIn && !this.synced && !this.busy) void this.run(() => this.checkOnOpen());
      $('cloud-signin').hidden = this.signedIn;
      for (const id of ['cloud-backup', 'cloud-restore', 'cloud-signout']) $(id).hidden = !this.signedIn;
      if (user) this.status(`Signed in as ${user.displayName || user.email || 'you'}. ${this.lastText()}`);
    });
    window.setInterval(() => {
      // The check on opening failed (offline, say): try again before any backup.
      if (this.signedIn && !this.synced && !this.pending && !this.busy) void this.run(() => this.checkOnOpen());
      else void this.backup(false);
    }, 30_000);
    this.setupInvite();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.backup(false, true);
      // Coming back to the game: another device may have played since, so look again before
      // this one backs anything up (a left-open app must never overwrite newer progress).
      else if (this.signedIn && !this.busy) {
        this.synced = false;
        this.pending = null;
        $('cloud-choice').hidden = true;
        void this.run(() => this.checkOnOpen());
      }
    });
  }

  /**
   * A one-time invite to connect a Google account, shown once per device after the tutorial,
   * when nothing else is on screen. Closing it in any way (X, Not now, tapping outside) is final.
   */
  private setupInvite(): void {
    if (asked()) return;
    const close = () => {
      markAsked();
      $('cloud-ask').hidden = true;
    };
    $('cloud-ask-close').addEventListener('click', close);
    $('cloud-ask-no').addEventListener('click', close);
    $('cloud-ask').addEventListener('click', (e) => {
      if (e.target === $('cloud-ask')) close();
    });
    $('cloud-ask-yes').addEventListener('click', () => void this.inviteSignIn(close));
    const timer = window.setInterval(() => {
      if (asked() || this.signedIn) {
        window.clearInterval(timer);
        return;
      }
      if (this.inviteReady()) {
        window.clearInterval(timer);
        $('cloud-ask').hidden = false;
      }
    }, 3000);
  }

  private inviteReady(): boolean {
    if (!this.authKnown || this.signedIn || this.busy) return false;
    if (this.game.state.tutorial >= 0 || Date.now() - this.openedAt < ASK_AFTER_MS) return false;
    if (document.body.classList.contains('cinematic') || document.visibilityState !== 'visible') return false;
    // Wait until no other window or tutorial tip is up.
    const busy = document.querySelector('.modal:not([hidden]), #coach:not([hidden])');
    return !busy;
  }

  private async inviteSignIn(close: () => void): Promise<void> {
    if (this.busy) return;
    const yes = $('cloud-ask-yes') as HTMLButtonElement;
    const note = $('cloud-ask-status');
    yes.disabled = true;
    note.hidden = false;
    note.textContent = 'Connecting…';
    this.busy = true;
    try {
      await this.signIn();
      close();
      // A save already in the cloud that is further along: show the choice in Settings.
      if (this.pending) $('settings-btn').click();
    } catch (e) {
      note.textContent = `That didn't work: ${(e as Error).message || 'please try again'}.`;
    } finally {
      this.busy = false;
      yes.disabled = false;
    }
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
    await this.compare(true);
  }

  /** On opening the game signed in: bring up the choice if another device got further. */
  private async checkOnOpen(): Promise<void> {
    if (await this.compare(false)) $('settings-btn').click();
  }

  /**
   * Compares the local save with the cloud. A cloud save further along waits for the player's
   * choice (returns true); otherwise this device may back up, straight away if `backupNow`.
   */
  private async compare(backupNow: boolean): Promise<boolean> {
    const cloud = await download();
    if (cloud && D(cloud.allTime).gt(this.game.state.allTime)) {
      this.ask(cloud);
      return true;
    }
    this.synced = true;
    if (backupNow) await this.backup(true);
    return false;
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
    this.keepArmed = false;
    $('cloud-keep').textContent = 'Keep this one';
    const when = new Date(cloud.savedAt).toLocaleString();
    $('cloud-choice-text').textContent = `The cloud has a station from ${when} with ${this.fmt(D(cloud.allTime))} scrap salvaged (${cloud.relocations} relocations). This one has ${this.fmt(this.game.state.allTime)}. Which do you want to keep?`;
    $('cloud-choice').hidden = false;
    this.status('Backups are paused until you pick which station to keep.');
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
    this.synced = true;
    this.lastBackup = Date.now();
    this.status('Cloud save loaded.');
  }

  /** Backs up when signed in: on demand, or when the last backup is old enough. */
  private async backup(force: boolean, leaving = false): Promise<void> {
    if (!this.signedIn || this.pending || !this.synced) return;
    const age = Date.now() - this.lastBackup;
    if (!force && age < (leaving ? LEAVE_MS : BACKUP_MS)) return;
    const s = this.game.state;
    try {
      // An automatic backup first checks that another device hasn't got further since (played on
      // both). When leaving, an answer that doesn't arrive in time just means no backup.
      if (!force) {
        const cloud = await download();
        if (cloud && cloud.savedAt > this.lastBackup && D(cloud.allTime).gt(s.allTime)) {
          this.synced = false;
          this.ask(cloud);
          if (!leaving) $('settings-btn').click();
          return;
        }
      }
      await upload({ code: exportCode(s), savedAt: Date.now(), allTime: s.allTime.toString(), relocations: s.stats.relocations });
      this.lastBackup = Date.now();
      if (force) this.status(`Backed up. ${this.lastText()}`);
    } catch (e) {
      if (force) throw e;
    }
  }
}

function asked(): boolean {
  try {
    return localStorage.getItem(ASK_KEY) === '1';
  } catch {
    return false;
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(ASK_KEY, '1');
  } catch {
    // Private mode: the invite may show again next time, which is harmless.
  }
}
