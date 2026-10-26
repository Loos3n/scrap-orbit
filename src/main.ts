// Swaps PixiJS's generated code for eval-free versions, so the game runs under strict
// Content-Security-Policy hosts (embedded pages, some app stores' web views).
import 'pixi.js/unsafe-eval';
import './style.css';
import { Sfx } from './audio';
import { GENERATORS, UPGRADES } from './core/config';
import { CREW, EVENTS, PAINTS, RESEARCH, THEMES } from './core/content';
import * as meta from './core/meta';
import * as eco from './core/economy';
import { format } from './core/num';
import { Game } from './game';
import { StationScene } from './scene/station';
import { GEN_ICONS, ICONS } from './ui/icons';
import { UI } from './ui/ui';

/**
 * If anything throws, say so on screen instead of silently freezing, so a player can report
 * what went wrong from a screenshot.
 */
function showCrash(message: string): void {
  let el = document.getElementById('crash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'crash';
    el.className = 'crash';
    document.body.appendChild(el);
  }
  el.textContent = `Something went wrong: ${message}`;
}
window.addEventListener('error', (e) => showCrash(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => showCrash(String((e.reason as Error)?.message ?? e.reason)));

/** Waits for `p`, but gives up after `ms` so a stuck graphics driver can't hang the game. */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);
}

async function boot(): Promise<void> {
  const game = new Game();
  const sfx = new Sfx();
  const ui = new UI(game);
  ui.onSoundChange = (sound, music) => {
    sfx.enabled = sound;
    sfx.setMusic(music);
  };
  ui.onRelocate = () => game.relocate();
  ui.syncSettings();
  const scene = new StationScene();
  const sceneEl = document.getElementById('scene')!;
  const stage = document.getElementById('stage')!;
  const syncFocus = () => {
    const r = stage.getBoundingClientRect();
    scene.setFocus(r.top, r.bottom);
  };
  syncFocus();
  // The game runs even if the graphics can't start (old or locked-down web views): the
  // station just isn't drawn, and taps still count.
  try {
    await within(scene.init(sceneEl), 6000);
  } catch (err) {
    console.warn('Scene failed to start', err);
    sceneEl.classList.add('fallback');
  }
  syncFocus();
  new ResizeObserver(syncFocus).observe(stage);
  scene.setOwned(game.state.owned);
  const syncPerks = () => scene.setCrateRate((eco.hasPerk(game.state, 'magnet') ? 2 : 1) * eco.researchProduct(game.state, 'crateRate'));
  syncPerks();
  const syncDecor = () => {
    const s = game.state;
    scene.setTheme(THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0], (PAINTS.find((p) => p.id === s.decor.paint) ?? PAINTS[0]).tint);
    document.documentElement.style.setProperty('--theme-core', '#' + (THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0]).core.toString(16).padStart(6, '0'));
  };
  syncDecor();
  ui.onTab = (tab) => {
    if (tab === 'upgrades') game.advanceTutorial(2);
  };

  const fmt = (v: Parameters<typeof format>[0]) => format(v, game.state.settings.numbers);
  const buzz = (ms: number) => {
    if (game.state.settings.haptics && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Not allowed in this context; ignore.
      }
    }
  };
  // Browsers only start audio after a gesture; any first touch anywhere unlocks it.
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });

  game.on((e) => {
    switch (e.type) {
      case 'bought':
        scene.setOwned(game.state.owned);
        ui.flashRow(e.gen);
        sfx.buy();
        buzz(5);
        if (e.gen === 'drone') game.advanceTutorial(1);
        break;
      case 'milestone': {
        const g = GENERATORS.find((x) => x.id === e.gen)!;
        ui.toast(GEN_ICONS[g.id], `<b>${e.at} ${g.name}s!</b> Output doubled`);
        scene.celebrate(g.color);
        sfx.milestone();
        buzz(30);
        break;
      }
      case 'upgrade': {
        const u = UPGRADES.find((x) => x.id === e.id)!;
        ui.toast(ICONS.star, `<b>${u.name}</b> installed`);
        scene.celebrate();
        sfx.upgrade();
        break;
      }
      case 'boost':
        game.advanceTutorial(3);
        ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), `<b>Overdrive!</b> 2x everything for ${eco.boostDurationSec(game.state)} seconds`);
        sfx.boost();
        buzz(40);
        break;
      case 'offline':
        ui.showOffline(e.seconds, e.earned, () => sfx.coins());
        break;
      case 'bonus':
        ui.toast(ICONS.scrap, `<b>Salvage crate!</b> +${fmt(e.value)}`);
        sfx.crate();
        break;
      case 'achievement':
        ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>${e.def.name}</b> +1% income and 3 crystals`);
        sfx.achievement();
        break;
      case 'relocate':
        scene.warpJump();
        // Swap the station over at the brightest moment of the flash.
        setTimeout(() => scene.setOwned(game.state.owned), 1500);
        syncPerks();
        ui.toast(ICONS.core, `<b>New sector!</b> +${e.cores.toLocaleString('en-US')} Star Cores, +${e.crystals} crystals`);
        sfx.warp();
        buzz(60);
        break;
      case 'reset':
        scene.setOwned(game.state.owned);
        syncPerks();
        syncDecor();
        break;
      case 'crew': {
        const c = CREW.find((x) => x.id === e.id)!;
        ui.toast(ICONS.crew.replace('currentColor', '#4fe3c1'), e.level === 1 ? `<b>${c.name}</b> joined the crew!` : `<b>${c.name}</b> reached level ${e.level}`);
        scene.celebrate(GENERATORS.find((g) => g.id === c.gen)!.color);
        sfx.upgrade();
        buzz(20);
        break;
      }
      case 'research': {
        const r = RESEARCH.find((x) => x.id === e.id)!;
        if (e.phase === 'done') {
          ui.toast(ICONS.lab.replace('currentColor', '#5ce1ff'), `<b>${r.name}</b> research complete`);
          scene.celebrate(0x5ce1ff);
          sfx.research();
          buzz(25);
          syncPerks();
        } else {
          sfx.buy();
        }
        break;
      }
      case 'decor':
        syncDecor();
        sfx.upgrade();
        break;
      case 'mission':
        ui.toast(ICONS.crystal, `<b>Mission complete!</b> +${e.crystals} crystals`);
        sfx.coins();
        buzz(20);
        break;
      case 'missionReady':
        ui.toast(ICONS.missions.replace('currentColor', '#4fe3c1'), '<b>Mission ready</b> to claim on the mission board');
        break;
      case 'event':
        scene.setEvent(e.phase === 'start' ? e.kind : null);
        if (e.phase === 'start') {
          ui.toast(e.kind === 'meteors' ? ICONS.meteor : e.kind === 'flare' ? ICONS.flare : ICONS.crystal, `<b>${EVENTS[e.kind].name}!</b> ${EVENTS[e.kind].desc}`);
          sfx.event();
          buzz(30);
        }
        break;
      case 'meteor':
        sfx.meteor();
        break;
      case 'convoy':
        ui.toast(ICONS.crystal, `<b>Convoy boarded!</b> +${e.crystals} crystals`);
        sfx.crate();
        break;
      case 'tutorial':
        if (e.step === 1) ui.showTab('build');
        break;
    }
  });

  sceneEl.addEventListener('pointerdown', (ev) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const hit = scene.hitSpecial(x, y);
    if (hit === 'crate') {
      const v = game.collectBonus();
      scene.floatText(0, -60, `+${fmt(v)}`, true);
      buzz(25);
      return;
    }
    if (hit === 'meteor') {
      const v = game.smashMeteor();
      scene.floatText(scene.lastHit.x, scene.lastHit.y, `+${fmt(v)}`);
      buzz(15);
      return;
    }
    if (hit === 'convoy') {
      const n = game.boardConvoy();
      scene.floatText(scene.lastHit.x, scene.lastHit.y, `+${n} crystals`, true);
      buzz(25);
      return;
    }
    const value = game.tap();
    if (game.state.tutorial === 0 && game.state.taps >= 8) game.advanceTutorial(0);
    scene.tapAt(x, y, `+${fmt(value)}`);
    ui.bumpScrap();
    sfx.tap();
    buzz(8);
  });

  game.start();
  scene.setEvent(meta.eventActive(game.state, Date.now()));

  let lastUi = 0;
  let lastFrame = performance.now();
  // The game loop has its own animation frame, separate from the renderer's.
  const loop = () => {
    requestAnimationFrame(loop);
    const now = Date.now();
    const t = performance.now();
    game.update(now);
    scene.setBoost(eco.boostActive(game.state, now));
    ui.renderHud((t - lastFrame) / 1000);
    lastFrame = t;
    if (now - lastUi > 100) {
      lastUi = now;
      ui.render();
    }
  };
  requestAnimationFrame(loop);

  const save = () => game.save();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}

boot();
