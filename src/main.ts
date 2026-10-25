import './style.css';
import { GENERATORS, UPGRADES } from './core/config';
import * as eco from './core/economy';
import { format } from './core/num';
import { Game } from './game';
import { StationScene } from './scene/station';
import { UI } from './ui/ui';

async function boot(): Promise<void> {
  const game = new Game();
  const ui = new UI(game);
  const scene = new StationScene();
  const sceneEl = document.getElementById('scene')!;
  await scene.init(sceneEl);
  scene.setOwned(game.state.owned);

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

  game.on((e) => {
    switch (e.type) {
      case 'bought':
        scene.setOwned(game.state.owned);
        break;
      case 'milestone': {
        const g = GENERATORS.find((x) => x.id === e.gen)!;
        ui.toast(`<b>${g.name} x${e.at}</b> output doubled`);
        scene.celebrate(g.color);
        buzz(30);
        break;
      }
      case 'upgrade': {
        const u = UPGRADES.find((x) => x.id === e.id)!;
        ui.toast(`<b>${u.name}</b> installed`);
        scene.celebrate();
        break;
      }
      case 'boost':
        ui.toast('<b>Overdrive!</b> 2x everything for 30 seconds');
        buzz(40);
        break;
      case 'offline':
        ui.showOffline(e.seconds, fmt(e.earned));
        break;
      case 'bonus':
        ui.toast(`<b>Salvage crate!</b> +${fmt(e.value)}`);
        break;
      case 'reset':
        scene.setOwned(game.state.owned);
        break;
    }
  });

  sceneEl.addEventListener('pointerdown', (ev) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (scene.hitCrate(x, y)) {
      const v = game.collectBonus();
      scene.floatText(0, -40, `+${fmt(v)}`, true);
      buzz(25);
      return;
    }
    const value = game.tap();
    scene.tapAt(x, y, `+${fmt(value)}`);
    buzz(8);
  });

  game.start();

  let lastUi = 0;
  scene.app.ticker.add(() => {
    const now = Date.now();
    game.update(now);
    scene.setBoost(eco.boostActive(game.state, now));
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
