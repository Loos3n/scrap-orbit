import { CREW } from '../core/content';
import { CHAPTERS, FINALE_ID, GUESTS, STORY, nextStory, pendingStory, radioOpen, type Speaker, type StoryEntry } from '../core/story';
import type { Game } from '../game';
import { portrait } from './portrait';

/**
 * The radio: a round button on the side rail once the first Hollow Fleet transmission comes in,
 * glowing while one is waiting. It opens the radio log (every transmission so far, to replay, and
 * a hint for the next) or plays the waiting one, a speaker at a time with the words typed out.
 */

const $ = (id: string) => document.getElementById(id)!;
const CHAR_MS = 22;

export interface RadioHooks {
  /** A transmission starts or a new line comes in. */
  crackle(): void;
  blip(): void;
  /** Playing (an entry id) or closed (null), for the music. */
  playing(id: string | null): void;
}

function speaker(who: Speaker): { name: string; role: string; face: string } {
  const crew = CREW.find((c) => c.id === who);
  if (crew) return { name: crew.name, role: crew.role, face: portrait(crew) };
  const g = GUESTS[who as keyof typeof GUESTS];
  return { name: g.name, role: g.role, face: portrait({ ...CREW[0], ...g }) };
}

export class StoryRadio {
  private entry: StoryEntry | null = null;
  private replay = false;
  private line = 0;
  private typing = 0;
  private full = '';
  private shown = '';

  constructor(
    private game: Game,
    private hooks: RadioHooks,
  ) {
    $('radio-btn').addEventListener('click', () => this.open());
    $('radio-close').addEventListener('click', () => this.close());
    $('radio').addEventListener('click', (e) => {
      if (e.target === $('radio')) this.close();
    });
    $('radio-next').addEventListener('click', () => this.next());
    $('radio-text').addEventListener('click', () => this.next());
    $('radio-end-ok').addEventListener('click', () => this.close());
    this.render();
  }

  get isOpen(): boolean {
    return !$('radio').hidden;
  }

  /** Shows the button once the story has begun, glowing while a transmission waits. */
  render(): void {
    const s = this.game.state;
    const btn = $('radio-btn');
    btn.hidden = !radioOpen(s);
    const waiting = pendingStory(s) !== null;
    btn.classList.toggle('signal', waiting);
    $('radio-dot').hidden = !waiting;
  }

  /** Plays the waiting transmission, or shows the log. */
  open(): void {
    const ready = pendingStory(this.game.state);
    $('radio').hidden = false;
    if (ready) this.play(ready, false);
    else this.showLog();
  }

  close(): void {
    window.clearTimeout(this.typing);
    // Closing mid-way through a new transmission still counts it as heard.
    if (this.entry && !this.replay) this.game.hearStory(this.entry.id);
    this.entry = null;
    $('radio').hidden = true;
    this.hooks.playing(null);
    this.render();
  }

  private view(name: 'log' | 'play' | 'end'): void {
    $('radio-log').hidden = name !== 'log';
    $('radio-play').hidden = name !== 'play';
    $('radio-end').hidden = name !== 'end';
    $('radio').querySelector('.modal-card')!.scrollTop = 0;
  }

  private showLog(): void {
    this.view('log');
    const s = this.game.state;
    const heard = STORY.filter((e) => s.story.heard.has(e.id)).length;
    $('radio-intro').textContent =
      heard === STORY.length
        ? 'Every transmission, from the first crackle to the Lantern coming home.'
        : `${heard} of ${STORY.length} transmissions. Keep following the beacon to hear the rest.`;
    const list = $('radio-list');
    list.replaceChildren();
    const next = nextStory(s);
    const ready = pendingStory(s);
    let chapter = -1;
    for (const e of STORY) {
      const got = s.story.heard.has(e.id);
      const isNext = e === next;
      if (!got && !isNext) break;
      if (e.chapter !== chapter) {
        chapter = e.chapter;
        const h = document.createElement('li');
        h.className = 'radio-chapter';
        h.textContent = `Chapter ${chapter + 1} · ${CHAPTERS[chapter]}`;
        list.append(h);
      }
      const li = document.createElement('li');
      li.className = `radio-item${got ? '' : e === ready ? ' ready' : ' locked'}`;
      const text = document.createElement('span');
      text.className = 'grow';
      const b = document.createElement('b');
      b.textContent = got || e === ready ? e.title : 'Next transmission';
      const small = document.createElement('small');
      small.textContent = got ? `${e.lines.length} messages` : e === ready ? 'Incoming now' : e.hint;
      text.append(b, small);
      li.append(text);
      if (got || e === ready) {
        const play = document.createElement('button');
        play.type = 'button';
        play.textContent = got ? 'Replay' : 'Listen';
        play.addEventListener('click', () => this.play(e, got));
        li.append(play);
      }
      list.append(li);
    }
  }

  private play(entry: StoryEntry, replay: boolean): void {
    this.entry = entry;
    this.replay = replay;
    this.line = 0;
    this.view('play');
    $('radio-chapter').textContent = `Chapter ${entry.chapter + 1} · ${CHAPTERS[entry.chapter]}`;
    $('radio-entry').textContent = entry.title;
    const dots = $('radio-dots');
    dots.replaceChildren(...entry.lines.map(() => document.createElement('i')));
    this.hooks.playing(entry.id);
    this.hooks.crackle();
    this.showLine();
  }

  private showLine(): void {
    const entry = this.entry!;
    const l = entry.lines[this.line];
    const who = speaker(l.who);
    const face = $('radio-face');
    face.innerHTML = who.face;
    face.classList.toggle('static', l.who === 'radio');
    $('radio-name').textContent = who.name;
    $('radio-role').textContent = who.role;
    $('radio-text').classList.toggle('static', l.who === 'radio');
    [...$('radio-dots').children].forEach((d, i) => d.classList.toggle('on', i <= this.line));
    $('radio-next').textContent = this.line === entry.lines.length - 1 ? (entry.id === FINALE_ID && !this.replay ? 'Welcome them home' : 'Close') : 'Next';
    this.full = l.text;
    this.shown = '';
    this.hooks.blip();
    this.type();
  }

  /** Types the line out a few letters at a time. */
  private type(): void {
    window.clearTimeout(this.typing);
    const el = $('radio-text');
    if (this.shown.length >= this.full.length) {
      el.textContent = this.full;
      return;
    }
    this.shown = this.full.slice(0, this.shown.length + 2);
    el.textContent = this.shown;
    this.typing = window.setTimeout(() => this.type(), CHAR_MS * 2);
  }

  private next(): void {
    if (!this.entry) return;
    // First tap finishes the typing; the next moves on.
    if (this.shown.length < this.full.length) {
      this.shown = this.full;
      this.type();
      return;
    }
    if (this.line < this.entry.lines.length - 1) {
      this.line++;
      this.showLine();
      return;
    }
    const { id } = this.entry;
    const fresh = !this.replay;
    if (fresh) this.game.hearStory(id);
    this.entry = null;
    if (id === FINALE_ID && fresh) {
      this.view('end');
      return;
    }
    // Back to the log if another is waiting (or after a replay); otherwise close.
    if (pendingStory(this.game.state) || !fresh) {
      this.hooks.playing(null);
      this.showLog();
    } else this.close();
    this.render();
  }
}
