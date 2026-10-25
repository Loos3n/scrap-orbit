// Swaps PixiJS's generated code for eval-free versions, so the game runs under strict
// Content-Security-Policy hosts (embedded pages, some app stores' web views).
import 'pixi.js/unsafe-eval';
import './style.css';
import { Sfx } from './audio';
import { GENERATORS, UPGRADES } from './core/config';
import * as eco from './core/economy';
import { format } from './core/num';
import { Game } from './game';
import { StationScene } from './scene/station';
import { GEN_ICONS, ICONS } from './ui/icons';
import { UI } from './ui/ui';

async function boot(): Promise<void> {
  const game = new Game();
  const sfx = new Sfx();
  const ui = new UI(game);
  ui.onSoundChange = (on) => (sfx.enabled = on);
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
  await scene.init(sceneEl);
  syncFocus();
  new ResizeObserver(syncFocus).observe(stage);
  scene.setOwned(game.state.owned);
  const syncPerks = () => scene.setCrateRate(eco.hasPerk(game.state, 'magnet') ? 2 : 1);
  syncPerks();

  const fmt = (v: Parameters<typeof format>[0]) => format(v, game.state.settings.scientific);
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
        ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>${e.def.name}</b> +1% income forever`);
        sfx.achievement();
        break;
      case 'relocate':
        scene.warpJump();
        // Swap the station over at the brightest moment of the flash.
        setTimeout(() => scene.setOwned(game.state.owned), 1500);
        syncPerks();
        ui.toast(ICONS.core, `<b>New sector!</b> +${e.cores.toLocaleString('en-US')} Star Cores`);
        sfx.warp();
        buzz(60);
        break;
      case 'reset':
        scene.setOwned(game.state.owned);
        syncPerks();
        break;
    }
  });

  sceneEl.addEventListener('pointerdown', (ev) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (scene.hitCrate(x, y)) {
      const v = game.collectBonus();
      scene.floatText(0, -60, `+${fmt(v)}`, true);
      buzz(25);
      return;
    }
    const value = game.tap();
    scene.tapAt(x, y, `+${fmt(value)}`);
    ui.bumpScrap();
    sfx.tap();
    buzz(8);
  });

  game.start();

  let lastUi = 0;
  let lastFrame = performance.now();
  scene.app.ticker.add(() => {
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
  });

  const save = () => game.save();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}

boot();
