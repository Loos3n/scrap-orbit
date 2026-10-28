// Swaps PixiJS's generated code for eval-free versions, so the game runs under strict
// Content-Security-Policy hosts (embedded pages, some app stores' web views).
import 'pixi.js/unsafe-eval';
// Fonts ship with the game (no network needed), which the phone app relies on.
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-600.css';
import './style.css';
import { Sfx } from './audio';
import { CLAW, GENERATORS, UPGRADES } from './core/config';
import { BOSS_NAMES, CREW, EVENTS, PAINTS, PETS, RESEARCH, THEMES, TUTORIAL_DRONES, TUTORIAL_TAPS, sectorFor } from './core/content';
import { SAFE_TYPES, SETS, SKINS } from './core/collection';
import { CHALLENGES, GOLDEN, LOOT, TRIPS, moduleDef } from './core/expansion';
import * as meta from './core/meta';
import * as eco from './core/economy';
import { D, format } from './core/num';
import { Game } from './game';
import { StationScene } from './scene/station';
import { GEN_ICONS, ICONS } from './ui/icons';
import { shakeBossBanner, showBossAlert } from './ui/meta-ui';
import { SafeGame, safeText } from './ui/book-ui';
import { galaxyText } from './ui/galaxy-ui';
import { tradeText } from './ui/trade-ui';
import { UI } from './ui/ui';
import { Fanfare } from './ui/fanfare';
import { blockPageZoom } from './ui/nozoom';
import { ORNAMENTS } from './core/ornaments';

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

/** Names the sector (or galaxy) the station just warped into. */
function showSectorCard(relocations: number, galaxy = 0): void {
  const card = document.getElementById('sector-card')!;
  document.getElementById('sector-num')!.textContent = galaxy ? `Galaxy ${galaxy} · Sector ${relocations + 1}` : `Sector ${relocations + 1}`;
  document.getElementById('sector-name')!.textContent = sectorFor(relocations).name;
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  window.setTimeout(() => (card.hidden = true), 4000);
}

const hexColor = (c: number) => '#' + c.toString(16).padStart(6, '0');

async function boot(): Promise<void> {
  blockPageZoom();
  const game = new Game();
  /** The tint of the skin the active pet wears, if any. */
  const petTint = () => {
    const pet = game.state.pets.active;
    return LOOT.find((l) => l.id === (pet && game.state.skins[pet]))?.tint ?? 0xffffff;
  };
  const sfx = new Sfx();
  const ui = new UI(game);
  ui.safeGame = new SafeGame(game, (kind) => {
    if (kind === 'open') sfx.upgrade();
    else if (kind === 'miss') sfx.bossHit();
    else if (kind === 'done') sfx.achievement();
    else sfx.buy();
    buzz(kind === 'miss' ? 30 : 15);
  });
  ui.onSoundChange = (effects, music) => sfx.setVolumes(effects, music);
  ui.onRelocate = () => game.relocate();
  ui.syncSettings();
  const scene = new StationScene();
  ui.onComfortChange = (reduceFlash, reduceShake) => scene.setComfort(reduceFlash, reduceShake);
  ui.syncSettings();
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
  if (scene.ready) ui.coach.crate = () => scene.crateOnScreen();
  new ResizeObserver(syncFocus).observe(stage);
  scene.setOwned(game.state.owned);
  scene.setViewZoom(game.state.settings.viewZoom);
  const syncPerks = () =>
    scene.setCrateRate((eco.hasPerk(game.state, 'magnet') ? 2 : 1) * eco.researchProduct(game.state, 'crateRate') * (meta.petActive(game.state, 'pup') ? 1.5 : 1));
  syncPerks();
  const syncDecor = () => {
    const s = game.state;
    scene.setTheme(THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0], (PAINTS.find((p) => p.id === s.decor.paint) ?? PAINTS[0]).tint, SKINS.find((k) => k.id === s.skin) ?? null);
    document.documentElement.style.setProperty('--theme-core', '#' + (THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0]).core.toString(16).padStart(6, '0'));
  };
  syncDecor();

  const fmt = (v: Parameters<typeof format>[0]) => format(v, game.state.settings.numbers);
  const buzz = (ms: number | number[]) => {
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

  const fanfare = new Fanfare(() => game.state.settings.reduceFlash);
  // Decorations earned together (an old save catching up) share one toast.
  let freshOrnaments: string[] = [];

  game.on((e) => {
    switch (e.type) {
      case 'bought': {
        // The machine shows up in orbit as its orb lands on the station.
        const g = GENERATORS.find((x) => x.id === e.gen)!;
        const color = g.color;
        // The very first of a machine, ever, gets a celebration once it lands.
        const first = !game.state.collection.has(`gen:${e.gen}`) && game.state.tutorial < 0;
        if (first) game.state.collection.add(`gen:${e.gen}`);
        ui.flyToStation(e.gen, hexColor(color), scene.hubOnScreen(), () => {
          scene.setOwned(game.state.owned);
          scene.arrive(color);
          if (!first) return;
          fanfare.cheer({ icon: GEN_ICONS[e.gen], kicker: 'New machine', title: g.name, sub: g.blurb, color: hexColor(color) });
          scene.fireworks([color, 0xffd166, 0xffffff]);
          sfx.fanfare();
          buzz([30, 60, 30]);
        });
        ui.flashRow(e.gen);
        sfx.buy();
        buzz(5);
        if (e.gen === 'drone') {
          game.advanceTutorial('drone');
          if (game.state.owned.drone >= TUTORIAL_DRONES) game.advanceTutorial('more');
        }
        break;
      }
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
        game.advanceTutorial('upgrade');
        scene.celebrate();
        sfx.upgrade();
        break;
      }
      case 'boost':
        game.advanceTutorial('boost');
        ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), `<b>Overdrive!</b> 2x everything for ${eco.boostDurationSec(game.state)} seconds`);
        sfx.boost();
        buzz(40);
        break;
      case 'offline':
        ui.showOffline(e.seconds, e.earned, e.report, () => sfx.coins());
        break;
      case 'bonus':
        ui.toast(ICONS.scrap, `<b>Salvage crate!</b> +${fmt(e.value)}`);
        ui.bigGain(e.value);
        game.advanceTutorial('crate');
        sfx.crate();
        break;
      case 'achievement':
        ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>${e.def.name}</b> +1% income and 3 crystals`);
        sfx.achievement();
        break;
      case 'relocate':
        scene.warpJump();
        // Swap the station and the sector over at the brightest moment of the flash.
        setTimeout(() => {
          scene.setOwned(game.state.owned);
          scene.setSector(sectorFor(game.state.stats.relocations));
          showSectorCard(game.state.stats.relocations);
          fanfare.confetti();
          scene.fireworks([0x8f7bff, 0x5cd6ff, 0xffd166]);
          sfx.fanfare();
        }, 1500);
        syncPerks();
        ui.toast(ICONS.core, `<b>New sector!</b> +${e.cores.toLocaleString('en-US')} Star Cores, +${e.crystals} crystals`);
        sfx.warp();
        buzz(60);
        break;
      case 'galaxy':
        scene.galaxyJump();
        setTimeout(() => {
          scene.setOwned(game.state.owned);
          scene.setSector(sectorFor(game.state.stats.relocations));
          scene.setGalaxy(game.state.galaxy.shifts);
          showSectorCard(game.state.stats.relocations, game.state.galaxy.shifts + 1);
          fanfare.confetti(['#ffe9a8', '#8f7bff', '#ffd166', '#ffffff']);
          scene.fireworks([0xffe9a8, 0x8f7bff, 0xffffff]);
        }, 1500);
        syncPerks();
        ui.toast(ICONS.star.replace('currentColor', '#ffe9a8'), galaxyText(e.stars, game.state.galaxy.shifts + 1));
        sfx.warp();
        setTimeout(() => sfx.achievement(), 1700);
        buzz([60, 80, 120]);
        break;
      case 'starNode':
        scene.setOwned(game.state.owned);
        sfx.upgrade();
        scene.celebrate(0xffe9a8);
        buzz(15);
        syncPerks();
        break;
      case 'claw':
        ui.flashRow('claw');
        sfx.buy();
        buzz(5);
        if (e.level % CLAW.doubleEvery === 0) {
          ui.toast(ICONS.claw, `<b>Claw level ${e.level}!</b> Taps doubled`);
          scene.celebrate(0x9aa6ff);
          sfx.milestone();
        }
        break;
      case 'reset':
        scene.setOwned(game.state.owned);
        scene.setPet(null);
        scene.setBoss(null);
        scene.setSector(sectorFor(0));
        scene.setGalaxy(0);
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
      case 'streak':
        ui.streak.open();
        break;
      case 'streakClaim': {
        const r = e.reward;
        if (r.kind === 'pet') {
          const p = PETS.find((x) => x.id === r.pet)!;
          ui.toast(ICONS.crew.replace('currentColor', '#c58cff'), `<b>${p.name}</b> joined the station!`);
          scene.setPet(game.state.pets.active, petTint());
          syncPerks();
        } else {
          ui.toast(r.kind === 'crystals' ? ICONS.crystal : ICONS.scrap, `<b>Day ${game.state.login.streak} reward!</b> +${r.kind === 'crystals' ? `${r.amount} crystals` : fmt(r.amount)}`);
        }
        scene.celebrate(0xffd166);
        sfx.coins();
        buzz(30);
        break;
      }
      case 'pet':
        scene.setPet(game.state.pets.active, petTint());
        syncPerks();
        if (e.adopted) {
          const p = PETS.find((x) => x.id === e.id)!;
          ui.toast(ICONS.crew.replace('currentColor', '#c58cff'), `<b>${p.name}</b> adopted!`);
          scene.celebrate(p.color);
          sfx.upgrade();
          buzz(20);
        }
        break;
      case 'petTap':
        scene.petPounce(`+${fmt(e.value)}`);
        sfx.tap();
        break;
      case 'boss':
        scene.setBoss(game.state.boss!.name);
        showBossAlert(BOSS_NAMES[game.state.boss!.name % BOSS_NAMES.length], format(D(game.state.boss!.reward ?? 0)));
        sfx.bossAlarm();
        buzz(120);
        break;
      case 'bossHit':
        scene.bossHit();
        shakeBossBanner();
        sfx.bossHit();
        break;
      case 'bossDefeated': {
        scene.setBoss(null, true);
        ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>Wreck broken!</b> +${fmt(e.scrap)} and ${e.crystals} crystals`);
        ui.bigGain(e.scrap);
        sfx.bossBreak();
        buzz(80);
        const loot = LOOT.find((l) => l.id === e.loot);
        if (loot) {
          setTimeout(() => {
            ui.toast(ICONS.star.replace('currentColor', hexColor(loot.color)), `<b>Boss loot: ${loot.name}!</b> ${loot.desc}`);
            scene.celebrate(loot.color);
            sfx.achievement();
          }, 900);
        }
        break;
      }
      case 'bossEscape':
        scene.setBoss(null);
        ui.toast(ICONS.warp, '<b>The wreck flew away!</b> Break the next one within a minute.');
        sfx.event();
        break;
      case 'goldenSpawn':
        scene.spawnGolden();
        break;
      case 'golden':
        ui.toast(ICONS.star.replace('currentColor', '#ffd166'), `<b>Golden rush!</b> Everything earns ${GOLDEN.mult}x for ${GOLDEN.seconds} seconds`);
        scene.celebrate(0xffd166);
        sfx.milestone();
        buzz(60);
        break;
      case 'module':
        if (e.id) {
          ui.toast(ICONS.station.replace('currentColor', '#4fe3c1'), `<b>${moduleDef(e.id)!.name}</b> built`);
          sfx.upgrade();
          buzz(15);
        } else {
          sfx.buy();
        }
        break;
      case 'trip': {
        const c = CREW.find((x) => x.id === e.crew)!;
        ui.toast(ICONS.warp, `<b>${c.name}</b> set off for the ${TRIPS.find((t) => t.id === e.dest)!.name}`);
        sfx.boost();
        break;
      }
      case 'tripReady': {
        const c = CREW.find((x) => x.id === e.crew)!;
        ui.toast(ICONS.crew.replace('currentColor', '#4fe3c1'), `<b>${c.name} is back!</b> Open Crew, Trips to see the haul`);
        sfx.event();
        break;
      }
      case 'tripHome': {
        const r = e.reward;
        const c = CREW.find((x) => x.id === r.crew)!;
        ui.toast(ICONS.crystal, `<b>${c.name}'s haul:</b> +${fmt(r.scrap)} and ${r.crystals} crystals`);
        if (r.blueprint) {
          setTimeout(() => ui.toast(ICONS.station.replace('currentColor', '#c58cff'), `<b>Blueprint found: ${moduleDef(r.blueprint!)!.name}!</b> Build it in Station, Rooms`), 700);
        }
        scene.celebrate(0x4fe3c1);
        sfx.coins();
        buzz(25);
        break;
      }
      case 'trader':
        if (e.phase === 'arrived') {
          ui.toast(ICONS.crystal.replace('currentColor', '#5cd6ff'), '<b>A trader has docked!</b> Tap the banner to see the deals');
          sfx.event();
        } else ui.toast(ICONS.warp, 'The trader has moved on');
        scene.setTrader(e.phase === 'arrived');
        break;
      case 'safe':
        ui.toast(ICONS.lock.replace('currentColor', '#9dff6b'), '<b>Locked cargo drifting by!</b> Tap the banner to crack it before it floats off');
        sfx.event();
        break;
      case 'safeOpened':
        ui.toast(ICONS.lock.replace('currentColor', hexColor(SAFE_TYPES.find((t) => t.id === e.reward.type)!.color)), safeText(e.reward, fmt));
        if (e.reward.locks) {
          ui.bigGain(e.reward.scrap);
          scene.celebrate(0x9dff6b);
          sfx.coins();
        }
        break;
      case 'set': {
        const set = SETS.find((x) => x.id === e.id)!;
        const skin = SKINS.find((k) => k.id === set.skin);
        fanfare.cheer({
          icon: ICONS.trophy,
          kicker: 'Set complete',
          title: set.name,
          sub: `+${set.crystals} crystals${skin ? ` and the <b>${skin.name}</b> station skin` : ''}`,
          color: hexColor(set.color),
        });
        scene.celebrate(set.color);
        scene.fireworks([set.color, 0xffd166, 0xffffff]);
        sfx.fanfare();
        buzz([30, 60, 30]);
        break;
      }
      case 'ornament': {
        scene.setOrnaments(game.state.ornaments.on);
        if (!e.fresh) {
          sfx.buy();
          break;
        }
        if (!freshOrnaments.length) {
          // Wait a beat (and for any celebration card) so a batch shares one toast.
          window.setTimeout(() => fanfare.whenIdle(() => {
            const names = freshOrnaments.map((id) => ORNAMENTS.find((o) => o.id === id)!.name);
            freshOrnaments = [];
            const what = names.length === 1 ? `<b>${names[0]}</b> is` : `<b>${names.length} decorations</b> are`;
            ui.toast(ICONS.palette, `${what} up on the station. Change them in Station, Decor`);
            scene.celebrate(0xffd166);
            sfx.upgrade();
          }), 0);
        }
        freshOrnaments.push(e.id);
        break;
      }
      case 'stationSkin':
        syncDecor();
        sfx.upgrade();
        break;
      case 'trade':
        ui.toast(ICONS.crystal.replace('currentColor', '#5cd6ff'), tradeText(e.result, fmt));
        if (e.result.loot) scene.setPet(game.state.pets.active, petTint());
        sfx.coins();
        buzz(20);
        break;
      case 'challenge': {
        const c = CHALLENGES.find((x) => x.id === e.id)!;
        if (e.phase === 'start') {
          scene.warpJump();
          setTimeout(() => {
            scene.setOwned(game.state.owned);
            scene.setSector(sectorFor(game.state.stats.relocations));
          }, 1500);
          syncPerks();
          ui.showTab('build');
          ui.toast(ICONS.trophy.replace('currentColor', hexColor(c.color)), `<b>Challenge: ${c.name}</b> ${c.rule}${e.cores ? ` (+${e.cores} Star Cores banked)` : ''}`);
          sfx.boost();
        } else if (e.phase === 'done') {
          ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>Challenge beaten: ${c.name}!</b> ${c.reward}`);
          scene.celebrate(c.color);
          sfx.achievement();
          buzz(60);
        } else ui.toast(ICONS.trophy, `Gave up on ${c.name}. The run carries on as normal`);
        break;
      }
      case 'skin':
        scene.setPet(game.state.pets.active, petTint());
        sfx.upgrade();
        break;
      case 'tutorial':
        if (e.step === 'drone') ui.showTab('build');
        if (e.step === 'upgrade') ui.showTab('upgrades');
        break;
    }
  });

  // Press and hold a machine on the station to open its sheet (taps still salvage as usual).
  let hold = 0;
  let holdAt = { x: 0, y: 0 };
  const cancelHold = () => {
    clearTimeout(hold);
    hold = 0;
  };
  // Drag the first finger to pan the view a little. Other fingers keep tapping, and a press
  // only becomes a drag once it has moved, so taps and holds work as before.
  let drag: { id: number; x: number; y: number; moving: boolean } | null = null;
  const DRAG_START = 10;
  // Two fingers pinch to zoom the station. The zoom stays when they lift; the view still glides back
  // to the middle like after a drag. A mouse wheel does the same on a computer.
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch: { a: number; b: number } | null = null;
  const pinchSpan = () => {
    const [p, q] = [fingers.get(pinch!.a)!, fingers.get(pinch!.b)!];
    return { d: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  const keepZoom = () => {
    game.state.settings.viewZoom = scene.getViewZoom();
  };
  const endPinch = () => {
    pinch = null;
    sceneEl.classList.remove('panning');
    scene.panEnd();
    keepZoom();
  };
  // Zooming is for the full station screen, so it is off while the menu is up.
  const menuBtn = document.getElementById('menu-btn')!;
  const menuOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
  sceneEl.addEventListener('pointerdown', (ev) => {
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch || fingers.size !== 2 || menuOpen()) return;
    const [a, b] = [...fingers.keys()];
    pinch = { a, b };
    cancelHold();
    drag = null;
    sceneEl.classList.add('panning');
  });
  sceneEl.addEventListener('pointermove', (ev) => {
    if (!pinch || !fingers.has(ev.pointerId)) return;
    const before = pinchSpan();
    fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ev.pointerId !== pinch.a && ev.pointerId !== pinch.b) return;
    const after = pinchSpan();
    const rect = sceneEl.getBoundingClientRect();
    scene.panBy(after.x - before.x, after.y - before.y);
    scene.zoomAt(after.d / before.d, after.x - rect.left, after.y - rect.top);
  });
  for (const type of ['pointerup', 'pointercancel'] as const) {
    sceneEl.addEventListener(type, (ev) => {
      fingers.delete(ev.pointerId);
      if (pinch && (ev.pointerId === pinch.a || ev.pointerId === pinch.b)) endPinch();
    });
  }
  let wheelDone = 0;
  sceneEl.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      if (menuOpen()) return;
      const rect = sceneEl.getBoundingClientRect();
      scene.zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top);
      clearTimeout(wheelDone);
      wheelDone = window.setTimeout(() => {
        scene.panEnd();
        keepZoom();
      }, 250);
    },
    { passive: false },
  );
  sceneEl.addEventListener('pointermove', (ev) => {
    if (pinch) return;
    if (hold && Math.hypot(ev.clientX - holdAt.x, ev.clientY - holdAt.y) > 12) cancelHold();
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) < DRAG_START) return;
    if (!drag.moving) {
      cancelHold();
      sceneEl.classList.add('panning');
    }
    drag.moving = true;
    drag.x = ev.clientX;
    drag.y = ev.clientY;
    scene.panBy(dx, dy);
  });
  const endDrag = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag = null;
    sceneEl.classList.remove('panning');
    scene.panEnd();
  };
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    sceneEl.addEventListener(type, (ev) => {
      cancelHold();
      endDrag(ev);
    });
  }
  // Some apps that host the page take vertical swipes for themselves; claim them first.
  sceneEl.addEventListener('touchmove', (ev) => ev.cancelable && ev.preventDefault(), { passive: false });

  sceneEl.addEventListener('pointerdown', (ev) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (scene.traderAt(x, y) && meta.traderHere(game.state, Date.now())) {
      ui.openTrader();
      buzz(10);
      return;
    }
    cancelHold();
    if (!drag && !pinch) {
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moving: false };
      try {
        sceneEl.setPointerCapture(ev.pointerId);
      } catch {
        // Without capture the drag just ends if the finger leaves the scene.
      }
    }
    holdAt = { x: ev.clientX, y: ev.clientY };
    if (!pinch) hold = window.setTimeout(() => {
      hold = 0;
      const id = scene.machineAt(x, y);
      if (id && game.state.owned[id] > 0) {
        ui.openMachine(id);
        sfx.buy();
        buzz(20);
      }
    }, 450);
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
    if (hit === 'golden') {
      game.collectGolden();
      buzz(40);
      return;
    }
    if (hit === 'convoy') {
      const n = game.boardConvoy();
      scene.floatText(scene.lastHit.x, scene.lastHit.y, `+${n} crystals`, true);
      buzz(25);
      return;
    }
    const value = game.tap();
    if (game.state.taps >= TUTORIAL_TAPS) game.advanceTutorial('tap');
    scene.tapAt(x, y, `+${fmt(value)}`);
    ui.bumpScrap();
    sfx.tap();
    buzz(8);
  });

  scene.setSector(sectorFor(game.state.stats.relocations));
  scene.setGalaxy(game.state.galaxy.shifts);
  game.start();
  scene.setEvent(meta.eventActive(game.state, Date.now()));
  scene.setPet(game.state.pets.active, petTint());
  if (game.state.boss) scene.setBoss(game.state.boss.name);
  scene.setTrader(meta.traderHere(game.state, Date.now()));
  scene.setOrnaments(game.state.ornaments.on);

  let lastUi = 0;
  let lastFrame = performance.now();
  // The game loop has its own animation frame, separate from the renderer's.
  const loop = () => {
    requestAnimationFrame(loop);
    const now = Date.now();
    const t = performance.now();
    game.update(now);
    scene.setBoost(eco.boostActive(game.state, now));
    scene.holdCrate = game.tutorialStep === 'crate';
    scene.setBossHealth(meta.bossHealth(game.state));
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
