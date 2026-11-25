import { askPermission, cancelReminders, notificationsAvailable, scheduleReminders } from './notify';
import { WEEKLIES, allPaints, weeklyOn } from './core/weekly';
import { GROWTH, growthStage } from './core/growth';
import { GROUP_NAMES } from './ui/panes';
import { introShowing, showIntro } from './ui/intro';
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
import { SECTOR_THEMES, Sfx, type ThemeId } from './audio';
import { StoryRadio } from './ui/story-ui';
import { FishingPanel } from './ui/fishing-ui';
import { adsAvailable } from './ads';
import { setAdsSupported } from './core/rewards';
import { RARITY, tankCritters } from './core/fishing';
import { FINALE_ID, storyDone } from './core/story';
import { festivalActive } from './core/festival';
import { FLEET, SHIPS, powerText, shipsBuilt } from './core/fleet';
import { visitorHere } from './core/visitors';
import { SNACK_TEXT, snackMult } from './core/garden';
import { DivePanel } from './ui/dive-ui';
import { JourneyPanel, promotionText, rankBadge } from './ui/journey-ui';
import { CAPTAIN_PAINT_ID, currentRank } from './core/journey';
import { crewLine } from './core/crew-talk';
import type { CrewId } from './core/content';
import { FestivalPanel } from './ui/festival-ui';
import { CLAW, GENERATORS, MARKS, MILESTONE_MULT, UPGRADES } from './core/config';
import { modelName } from './core/evolve';
import { AD_CRYSTALS } from './core/rewards';
import { MARK_COLORS } from './art/kit';
import { BOSS_NAMES, CREW, EVENTS, PAINTS, PETS, RESEARCH, THEMES, TUTORIAL_DRONES, TUTORIAL_TAPS, sectorFor } from './core/content';
import { SAFE_TYPES, SETS, SKINS } from './core/collection';
import { CHALLENGES, GOLDEN, LOOT, TRIPS, moduleDef } from './core/expansion';
import * as meta from './core/meta';
import * as eco from './core/economy';
import { D, format } from './core/num';
import { Game } from './game';
import * as art from './scene/art';
import { JUMP_SWAP_MS, StationScene } from './scene/station';
import { sectorCrateMult, timeStretch } from './core/sectors';
import { comboMult } from './core/combo';
import { CONTRACT_CRYSTALS, contractCrateMult, contractDef, goalText } from './core/contracts';
import { CRATE_BUFFS } from './core/crate-buffs';
import { GEN_ICONS, ICONS, genIcon } from './ui/icons';
import { WhalePanel } from './ui/whale-ui';
import { PlanetPanel, planetLook } from './ui/planet-ui';
import { PLANET_PATHS, planetEra, pathText } from './core/planet';
import { WHALE, whaleStage } from './core/whale';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
import { shakeBossBanner, showBossAlert } from './ui/meta-ui';
import { SafeGame, safeText } from './ui/book-ui';
import { galaxyText } from './ui/galaxy-ui';
import { galaxyTrait } from './core/galaxy';
import { tradeText } from './ui/trade-ui';
import { UI, fmtSpeed } from './ui/ui';
import { Fanfare } from './ui/fanfare';
import { blockPageZoom } from './ui/nozoom';
import { setupBackButton } from './back';
import { canVibrate, vibrate } from './haptics';
import { registerServiceWorker, setupInstall } from './web-app';
import { setupKeys } from './ui/keys';
import { setupTabTitle } from './ui/tab-title';
import { ORNAMENTS } from './core/ornaments';
import { FriendsPanel } from './ui/friends-ui';
import { PHASE_LINES, daylight, type DayPhase } from './core/daynight';

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
function showSectorCard(relocations: number, galaxy = 0, speed = 0): void {
  const fast = document.getElementById('sector-speed')!;
  fast.hidden = speed < 1.05;
  fast.textContent = `Everything runs ${fmtSpeed(speed)} faster`;
  const card = document.getElementById('sector-card')!;
  document.getElementById('sector-num')!.textContent = galaxy ? `Galaxy ${galaxy} · Sector ${relocations + 1}` : `Sector ${relocations + 1}`;
  const sector = sectorFor(relocations);
  document.getElementById('sector-name')!.textContent = sector.name;
  const sub = document.getElementById('sector-sub')!;
  sub.className = sector.twist ? 'sector-twist' : '';
  sub.innerHTML = sector.twist ? `<b>${sector.twist.name}:</b> ${sector.twist.text}` : 'New sector reached';
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  card.style.animationDuration = sector.twist ? '6.5s' : '';
  window.setTimeout(() => (card.hidden = true), sector.twist ? 6500 : 4000);
}

/** The card after the very first relocation, so the player sees what prestige bought them. */
const FIRST_JUMP = (cores: number, speed: number) => ({
  icon: ICONS.core,
  kicker: 'First relocation',
  title: `${fmtSpeed(speed)} faster`,
  sub: `${cores.toLocaleString('en-US')} Star Cores now power every machine and tap. Earn more before your next jump to go even faster.`,
  color: '#8f7bff',
});

/** Fades the menus out while a jump plays, so the station has the whole screen, and back after it lands. */
function cinematic(swapMs: number): void {
  document.body.classList.add('cinematic');
  window.setTimeout(() => document.body.classList.remove('cinematic'), swapMs + 900);
}

const hexColor = (c: number) => '#' + c.toString(16).padStart(6, '0');

async function boot(): Promise<void> {
  blockPageZoom();
  setupBackButton();
  registerServiceWorker();
  const game = new Game();
  /** The tint of the skin the active pet wears, if any. */
  const petTint = () => {
    const pet = game.state.pets.active;
    return LOOT.find((l) => l.id === (pet && game.state.skins[pet]))?.tint ?? 0xffffff;
  };
  // No ad network on the web, so ad offers only show in the phone app.
  setAdsSupported(adsAvailable());
  document.getElementById('opt-ads')?.closest('label')?.toggleAttribute('hidden', !adsAvailable());
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
  if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __game: game });
  ui.onComfortChange = (reduceFlash, reduceShake) => scene.setComfort(reduceFlash, reduceShake);
  ui.onPowerChange = (saver) => scene.setBatterySaver(saver);
  ui.syncSettings();
  const sceneEl = document.getElementById('scene')!;
  const stage = document.getElementById('stage')!;
  let gliding = false;
  const syncFocus = () => {
    // The title screen frames the camera itself until it has glided back.
    if (introShowing() || gliding) return;
    const r = stage.getBoundingClientRect();
    scene.setFocus(r.top, r.bottom, r.left, r.right);
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
  showIntro(game, {
    focus: (top, bottom, left, right) => scene.setFocus(top, bottom, left, right),
    glide: (on) => {
      gliding = on;
      if (!on) syncFocus();
    },
    start: () => sfx.achievement(),
  });
  scene.setOwned(game.state.owned);
  scene.setViewZoom(game.state.settings.viewZoom);
  scene.setBatterySaver(game.state.settings.batterySaver);
  const syncPerks = () =>
    scene.setCrateRate((eco.hasPerk(game.state, 'magnet') ? 2 : 1) * eco.researchProduct(game.state, 'crateRate') * (meta.petActive(game.state, 'pup') ? 1.5 : 1) * sectorCrateMult(game.state) * contractCrateMult(game.state) * (weeklyOn(game.state, 'comets') ? 2 : 1) * snackMult(game.state, 'crates', Date.now()));
  syncPerks();
  const syncDecor = () => {
    const s = game.state;
    scene.setTheme(THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0], (allPaints().find((p) => p.id === s.decor.paint) ?? PAINTS[0]).tint, SKINS.find((k) => k.id === s.skin) ?? null);
    document.documentElement.style.setProperty('--theme-core', '#' + (THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0]).core.toString(16).padStart(6, '0'));
  };
  syncDecor();

  const fmt = (v: Parameters<typeof format>[0]) => format(v, game.state.settings.numbers);
  const buzz = (ms: number | number[]) => {
    if (game.state.settings.haptics) vibrate(ms);
  };
  // Browsers only start audio after a gesture; any first touch anywhere unlocks it.
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });

  const fanfare = new Fanfare(() => game.state.settings.reduceFlash);
  /**
   * Music follows the place: each sector has its own theme. A boss wreck brings its own, and the
   * radio plays a hushed one under the voices (and a big one when the Lantern comes home).
   */
  let radioTheme: ThemeId | null = null;
  const syncMusic = () => {
    const s = game.state;
    sfx.setTheme(festivalActive(s, Date.now()) ? 'frost' : SECTOR_THEMES[s.stats.relocations % SECTOR_THEMES.length]);
    sfx.setOverride(radioTheme ?? (s.boss ? 'boss' : null));
  };
  const radio = new StoryRadio(game, {
    crackle: () => sfx.radio(),
    blip: () => sfx.radioBlip(),
    playing: (id) => {
      radioTheme = id ? (id === FINALE_ID ? 'fleet' : 'radio') : null;
      syncMusic();
    },
  });
  if (import.meta.env.DEV) Object.assign(window, { __radio: radio });
  /** The Frost Festival: snow over the station, gift-wrapped crates and its own music while it runs. */
  const syncFestival = () => {
    const on = festivalActive(game.state, Date.now());
    scene.setSnow(on);
    scene.giftCrates = on;
  };
  const fishing = new FishingPanel(game, {
    cast: () => sfx.cast(),
    bite: () => sfx.bite(),
    hit: (n) => sfx.reelHit(n),
    miss: () => sfx.reelMiss(),
    escape: () => sfx.escape(),
    landed: (c) => (c.rarity === 'common' || c.rarity === 'uncommon' ? sfx.coins() : sfx.achievement()),
    buzz: (ms) => buzz(ms),
  });
  const dive = new DivePanel(game, (d) => fmt(d), {
    catch: (kind) => (kind === 'scrap' ? sfx.reelHit(1) : kind === 'gold' ? sfx.coins() : sfx.crate()),
    hurt: () => sfx.reelMiss(),
    start: () => sfx.boost(),
    end: () => sfx.event(),
    buzz: (ms) => buzz(ms),
  });
  const journey = new JourneyPanel(game, (d) => fmt(d), { pane: (name) => ui.showTab(name), toast: (icon, html) => ui.toast(icon, html) });
  if (import.meta.env.DEV) Object.assign(window, { __journey: journey });
  const festival = new FestivalPanel(game, () => {
    syncFestival();
    syncMusic();
  });
  /**
   * Day and night from the device clock (core/daynight.ts). Checked every 20 seconds; when the
   * light changes while playing, the crew mention it in a toast (not on start-up or in the tutorial).
   */
  let lastPhase: DayPhase | null = null;
  const syncDaylight = (instant = false) => {
    const on = game.state.settings.dayNight;
    const light = on ? daylight(Date.now()) : { night: 0, warm: 0, phase: 'day' as DayPhase };
    scene.setDaylight(light.night, light.warm, instant);
    sfx.setNight(light.night);
    document.body.classList.toggle('is-night', light.night > 0.5);
    if (on && lastPhase && light.phase !== lastPhase && game.state.tutorial < 0) ui.toast(light.phase === 'night' || light.phase === 'dusk' ? ICONS.moon : ICONS.star.replace('currentColor', '#ffd166'), PHASE_LINES[light.phase]);
    lastPhase = light.phase;
  };
  syncDaylight(true);

  /**
   * The crew out on the station deck (scene/crew-deck.ts): whoever is recruited and not away on
   * a trip, plus Mika from the start, since she shows new players the ropes.
   */
  const justHired = new Set<CrewId>();
  scene.crewTalk = (id, why) => {
    const s = game.state;
    const now = Date.now();
    const reason = why === 'arrive' ? (justHired.has(id) ? 'hello' : 'home') : why;
    justHired.delete(id);
    return crewLine(id, reason, {
      night: s.settings.dayNight && daylight(now).night > 0.6,
      boss: !!s.boss,
      festival: festivalActive(s, now),
      sector: sectorFor(s.stats.relocations).name,
      level: s.crew[id],
      caught: Object.values(s.fishing.caught).filter((n) => n > 0).length,
      aboard: crewAboard().length,
    });
  };
  const crewAboard = (): CrewId[] => {
    const s = game.state;
    return CREW.filter((c) => (s.crew[c.id] > 0 || c.id === 'mika') && !s.trips.some((t) => t.crew === c.id)).map((c) => c.id);
  };
  let crewKey = '';
  const syncCrew = () => {
    const ids = crewAboard();
    const key = ids.join();
    if (key === crewKey) return;
    crewKey = key;
    scene.setCrew(ids);
  };
  syncCrew();
  /** The Hollow Fleet circling the station (core/fleet.ts). */
  const syncFleet = (launched?: string) =>
    scene.setFleet(
      shipsBuilt(game.state).map((d) => ({ id: d.id, hull: d.hull, color: d.color, seed: SHIPS.indexOf(d) * 17 + 5 })),
      launched,
    );
  /** Stardrifter (core/whale.ts): the egg by the station, then the whale at its stage's size. */
  let whaleKey = '';
  const syncWhale = (hatch = false) => {
    const w = game.state.whale;
    const size = w.phase === 'born' ? whaleStage(game.state).size : 0;
    const key = `${w.phase}|${size}|${Math.round(w.mood / 10)}|${w.nursery}`;
    if (key === whaleKey && !hatch) return;
    whaleKey = key;
    scene.setWhaleEgg(w.phase === 'egg');
    scene.setWhale(size, w.mood / 100, hatch);
    scene.setWhaleBabies(w.nursery ? 3 : 0);
  };
  const whalePanel = new WhalePanel(game, (d) => fmt(d), {
    pet: () => {
      scene.whalePet();
      sfx.whaleSong(whaleStage(game.state).size, true);
      buzz(8);
    },
    tow: () => {
      game.towToNursery();
    },
  });
  /** The living planet (core/planet.ts) in the sky beside the station. */
  let planetKey = '';
  const syncPlanet = (flash = false) => {
    const look = planetLook(game);
    const key = look ? `${look.era}|${look.path}|${look.lights}` : '';
    if (key === planetKey && !flash) return;
    planetKey = key;
    scene.setPlanet(look, flash);
  };
  const planetPanel = new PlanetPanel(game, (d) => fmt(d), {
    pod: () => {
      sfx.boost();
      buzz(10);
      scene.planetPod(() => {
        sfx.meteor();
        syncPlanet();
      });
    },
  });
  /** Now and then, while it is out, the whale sings on its own. */
  let nextSong = Date.now() + 45_000;
  /** A visitor's shuttle at the dock (core/visitors.ts). */
  const syncVisitor = () => scene.setVisitor(visitorHere(game.state, Date.now())?.def.color ?? null);
  const friends = new FriendsPanel(game, (d) => fmt(d), () => scene.snapshot(), (icon, html) => ui.toast(icon, html));
  ui.friendsDot = () => friends.hasGifts;
  if (import.meta.env.DEV) Object.assign(window, { __friends: friends });
  // Test builds (VITE_PROBE=1) expose the game and scene to scripted checks.
  if (import.meta.env.VITE_PROBE) Object.assign(window, { __game: game, __scene: scene });
  window.setInterval(() => {
    syncDaylight();
    // A crate snack from the garden may have run out.
    syncPerks();
  }, 20_000);
  ui.onDayNightChange = () => {
    lastPhase = null;
    syncDaylight();
  };
  /** Grows the station's hull to match the machines owned, with a card when it gets bigger. */
  const syncGrowth = () => {
    const stage = growthStage(game.state.owned);
    if (!scene.setGrowth(stage)) return;
    const g = GROWTH[stage];
    fanfare.whenIdle(() => fanfare.cheer({ icon: ICONS.station, kicker: 'Station expanded', title: g.name, sub: g.desc, color: '#9fb0ff' }));
    scene.fireworks([0x9fb0ff, 0xffd98a, 0xffffff]);
    sfx.fanfare();
    buzz([20, 40, 20]);
  };
  syncGrowth();
  ui.onUnlock = (u) =>
    fanfare.whenIdle(() =>
      fanfare.cheer({ icon: ICONS[u.tab === 'prestige' ? 'core' : u.tab], kicker: 'New tab unlocked', title: GROUP_NAMES[u.tab], sub: u.news, color: '#4fe3c1' }),
    );
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
          syncGrowth();
          scene.arrive(color);
          if (!first) return;
          fanfare.cheer({ icon: GEN_ICONS[e.gen], kicker: 'New machine', title: g.name, sub: g.blurb, color: hexColor(color) });
          scene.fireworks([color, 0xffd166, 0xffffff]);
          sfx.fanfare();
          buzz([30, 60, 30]);
        });
        ui.flashRow(e.gen);
        sfx.buy(GENERATORS.findIndex((x) => x.id === e.gen), e.count);
        buzz(e.count >= 10 ? [8, 30, 12] : 5);
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
      case 'evolve': {
        const g = GENERATORS.find((x) => x.id === e.gen)!;
        const def = MARKS[e.mark - 1];
        const owned = game.state.owned[e.gen];
        scene.setOwned(game.state.owned);
        scene.evolve(e.gen);
        fanfare.cheer({
          icon: genIcon(e.gen, e.mark),
          kicker: `${def.title} model unlocked`,
          title: modelName(e.gen, owned),
          sub: `${def.look} Every ${g.name} now produces ${MILESTONE_MULT * def.mult}x as much.`,
          color: MARK_COLORS[e.mark - 1],
        });
        sfx.fanfare();
        buzz([30, 40, 60]);
        break;
      }
      case 'adReward':
        if (e.kind === 'overdrive' && e.fired) ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), '<b>Free Overdrive!</b> It had already recharged, so this one is on the house');
        else if (e.kind === 'overdrive') ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), '<b>Overdrive recharged!</b> Fire it when you are ready');
        else if (e.kind === 'crystals') ui.toast(ICONS.crystal.replace('currentColor', '#5cd6ff'), `<b>Supply drop!</b> +${AD_CRYSTALS} crystals`);
        else ui.toast(ICONS.scrap, '<b>Doubled!</b> Your time-away earnings came in twice');
        sfx.coins();
        buzz(30);
        break;
      case 'upgradeAll':
        ui.toast(ICONS.star, `<b>${e.ids.length} upgrades</b> installed`);
        game.advanceTutorial('upgrade');
        scene.celebrate();
        scene.fireworks([0xffd166, 0x5ce1ff, 0xc58cff]);
        sfx.upgrade();
        buzz([15, 30, 15]);
        break;
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
      case 'bonus': {
        const p = e.prize;
        game.advanceTutorial('crate');
        sfx.crate();
        if (p.kind === 'scrap') {
          ui.toast(ICONS.scrap, `<b>Salvage crate!</b> +${fmt(p.amount)}`);
          ui.bigGain(p.amount);
        } else if (p.kind === 'haul') {
          ui.toast(ICONS.scrap.replace('currentColor', '#ffd166'), `<b>Big haul!</b> The crate was packed: +${fmt(p.amount)}`);
          ui.bigGain(p.amount);
          sfx.coins();
          buzz([20, 30, 40]);
        } else if (p.kind === 'buff') {
          const b = CRATE_BUFFS[p.id];
          ui.toast(p.id === 'surge' ? ICONS.bolt.replace('currentColor', '#7cf0ff') : ICONS.claw.replace('currentColor', '#ffb347'), `<b>${b.name}!</b> ${b.mult}x ${b.what} for ${p.seconds} seconds${p.id === 'frenzy' ? '. Tap tap tap!' : ''}`);
          scene.celebrate(p.id === 'surge' ? 0x7cf0ff : 0xffb347);
          sfx.boost();
          buzz(40);
        } else if (p.kind === 'swarm') {
          scene.spawnSwarm(p.count);
          ui.toast(ICONS.scrap.replace('currentColor', '#9fe6ff'), `<b>Crate swarm!</b> ${p.count} little crates spilled out. Catch them!`);
          sfx.achievement();
          buzz([15, 30, 15]);
        } else if (p.kind === 'crystals') {
          ui.toast(ICONS.crystal, `<b>Crystal stash!</b> +${p.amount} crystals`);
          sfx.coins();
        } else {
          ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), '<b>Spare battery!</b> Overdrive is charged and ready');
          sfx.boost();
        }
        break;
      }
      case 'mini':
        sfx.coins();
        break;
      case 'achievement':
        ui.toast(ICONS.trophy.replace('currentColor', '#ffd166'), `<b>${e.def.name}</b> +1% income and 3 crystals`);
        sfx.achievement();
        break;
      case 'relocate':
        scene.warpJump();
        cinematic(JUMP_SWAP_MS.relocate);
        // Swap the station and the sector over at the brightest moment of the flash.
        setTimeout(() => {
          scene.setOwned(game.state.owned);
          syncGrowth();
          scene.setSector(sectorFor(game.state.stats.relocations));
          window.setTimeout(() => {
            showSectorCard(game.state.stats.relocations, 0, e.speed);
            fanfare.confetti();
            scene.fireworks([0x8f7bff, 0x5cd6ff, 0xffd166]);
            sfx.fanfare();
            ui.toast(ICONS.core, `<b>New sector!</b> +${e.cores.toLocaleString('en-US')} Star Cores, +${e.crystals} crystals`);
          }, 500);
          if (game.state.stats.relocations === 1) window.setTimeout(() => fanfare.cheer(FIRST_JUMP(e.cores, e.speed)), 4700);
        }, JUMP_SWAP_MS.relocate);
        syncPerks();
        sfx.warp();
        buzz([20, 60, 20, 60, 120]);
        break;
      case 'galaxy': {
        scene.galaxyJump();
        cinematic(JUMP_SWAP_MS.galaxy);
        const galaxyNo = game.state.galaxy.shifts + 1;
        const trait = galaxyTrait(game.state);
        sfx.warp();
        window.setTimeout(() => sfx.warp(), 1600);
        setTimeout(() => {
          scene.setOwned(game.state.owned);
          syncGrowth();
          scene.setSector(sectorFor(game.state.stats.relocations));
          scene.setGalaxy(game.state.galaxy.shifts);
          sfx.achievement();
          window.setTimeout(() => {
            fanfare.cheer({
              icon: ICONS.star.replace('currentColor', '#ffe9a8'),
              kicker: 'Galaxy Shift',
              title: `Welcome to Galaxy ${galaxyNo}`,
              sub: `+${e.stars.toLocaleString('en-US')} Galaxy Stars.${trait ? ` <b>${trait.name}:</b> ${trait.text}` : ''} New stars have come into view on the Star Map.`,
              color: '#ffe9a8',
            });
            fanfare.confetti(['#ffe9a8', '#8f7bff', '#ffd166', '#ffffff']);
            scene.fireworks([0xffe9a8, 0x8f7bff, 0xffffff]);
            sfx.fanfare();
            fanfare.whenIdle(() => showSectorCard(game.state.stats.relocations, galaxyNo));
            ui.toast(ICONS.star.replace('currentColor', '#ffe9a8'), galaxyText(e.stars, galaxyNo));
          }, 900);
        }, JUMP_SWAP_MS.galaxy);
        syncPerks();
        buzz([40, 60, 40, 60, 40, 60, 200]);
        break;
      }
      case 'starNode':
        scene.setOwned(game.state.owned);
        syncGrowth();
        sfx.upgrade();
        scene.celebrate(0xffe9a8);
        buzz(15);
        syncPerks();
        break;
      case 'rig': {
        const sector = sectorFor(game.state.stats.relocations);
        scene.setRig(true, true);
        fanfare.cheer({ icon: `<img src="${art.rigUrl(sector.look!)}" alt="">`, kicker: 'Rig built', title: sector.rig!.name, sub: sector.rig!.desc, color: hexColor(sector.rig!.color) });
        sfx.fanfare();
        buzz([20, 40, 20]);
        break;
      }
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
        // Also used when a backup code is loaded, so everything follows the new save.
        scene.setOwned(game.state.owned);
        syncGrowth();
        scene.setPet(game.state.pets.active, petTint());
        scene.setBoss(game.state.boss?.name ?? null);
        scene.setSector(sectorFor(game.state.stats.relocations));
        scene.setRig(game.state.rig);
        scene.setGalaxy(game.state.galaxy.shifts);
        scene.setTrader(meta.traderHere(game.state, Date.now()));
        scene.setOrnaments(game.state.ornaments.on);
        scene.setLantern(storyDone(game.state));
        scene.setTank(tankCritters(game.state));
        syncFleet();
        syncVisitor();
        syncWhale();
        radio.render();
        syncPerks();
        syncDecor();
        break;
      case 'crew': {
        const c = CREW.find((x) => x.id === e.id)!;
        ui.toast(ICONS.crew.replace('currentColor', '#4fe3c1'), e.level === 1 ? `<b>${c.name}</b> joined the crew!` : `<b>${c.name}</b> reached level ${e.level}`);
        if (e.level === 1 && e.id !== 'mika') justHired.add(e.id);
        else {
          scene.crewReact('party', e.id);
          scene.crewSay(e.id, crewLine(e.id, e.level === 1 ? 'hello' : 'levelup', { night: false, boss: false, festival: false, sector: '', level: e.level, caught: 0, aboard: 0 }));
        }
        syncCrew();
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
      case 'weekly': {
        const w = WEEKLIES.find((x) => x.id === e.id)!;
        syncPerks();
        if (e.phase === 'start') ui.toast(ICONS.star.replace('currentColor', w.color), `<b>${w.name}</b> this week! ${w.rule} Open the mission board for rewards`);
        else ui.toast(ICONS.star.replace('currentColor', w.color), `<b>${w.name}</b> reward ready on the mission board`);
        sfx.achievement();
        break;
      }
      case 'star': {
        const p = e.prize;
        const icon = ICONS.star.replace('currentColor', '#ffe27a');
        if (p.kind === 'jackpot') {
          fanfare.cheer({ icon, kicker: 'Lucky star', title: 'Jackpot!', sub: `An hour of scrap at once: +${fmt(p.amount)}`, color: '#ffd166' });
          sfx.fanfare();
        } else {
          const what = p.kind === 'crystals' ? `+${p.amount} crystals` : p.kind === 'overdrive' ? `a free Overdrive for ${p.seconds}s` : `ten minutes of scrap, +${fmt(p.amount)}`;
          ui.toast(icon, `<b>Lucky star!</b> It brought ${what}`);
          sfx.achievement();
        }
        if (p.kind === 'overdrive') sfx.boost();
        break;
      }
      case 'weeklyClaim':
        if (e.paint) {
          const p = allPaints().find((x) => x.id === e.paint)!;
          fanfare.cheer({ icon: ICONS.station, kicker: 'Weekly event reward', title: `${p.name} paint`, sub: 'Only this event gives it. Put it on in Station, Decor.', color: '#' + p.tint.toString(16).padStart(6, '0') });
          sfx.fanfare();
        } else ui.toast(ICONS.crystal, `<b>Weekly event!</b> +${e.crystals} crystals`);
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
      case 'story':
        radio.render();
        if (e.phase === 'ready') {
          if (game.state.tutorial >= 0) break;
          ui.toast(ICONS.radio.replace('currentColor', '#ffcf7a'), '<b>Incoming transmission!</b> Tap Radio to listen');
          sfx.radio();
          buzz([15, 40, 15]);
        } else if (e.id === FINALE_ID) {
          scene.setLantern(true, true);
          fanfare.confetti(['#ffcf7a', '#ffffff', '#ff8fa8', '#9fe6ff']);
          scene.fireworks([0xffcf7a, 0xffffff, 0x9fe6ff]);
          sfx.fanfare();
          buzz([40, 60, 40, 60, 200]);
        } else ui.toast(ICONS.radio.replace('currentColor', '#ffcf7a'), `<b>Transmission logged</b> +${e.crystals} crystals`);
        break;
      case 'fish': {
        scene.setTank(tankCritters(game.state));
        if (e.reward.surge) {
          ui.toast(ICONS.fish.replace('currentColor', RARITY.legendary.color), '<b>A legendary catch!</b> The station hums along: power surge, 5x income');
          scene.celebrate(0xffd166);
        }
        break;
      }
      case 'festival': {
        const flake = ICONS.snowflake.replace('currentColor', '#9fe6ff');
        if (e.from === 'present') {
          ui.toast(flake, `<b>A present under the tree!</b> +${e.flakes} snowflakes for the Frost Festival shop`);
          sfx.achievement();
        } else if (e.from === 'boss') ui.toast(flake, `<b>+${e.flakes} snowflakes</b> shaken loose from the wreck`);
        else if (e.bought === 'cocoa') {
          ui.toast(flake, `<b>Hot cocoa!</b> The crew warm up: 2x income for 30 minutes`);
          scene.celebrate(0xff8fa8);
          sfx.boost();
        } else if (e.bought === 'stocking') {
          ui.toast(ICONS.crystal, '<b>Crystal stocking!</b> +15 crystals');
          sfx.coins();
        } else if (e.bought === 'hoarfrost') {
          fanfare.cheer({ icon: ICONS.station, kicker: 'Frost Festival', title: 'Hoarfrost paint', sub: 'Only the festival gives it. Put it on in Station, Decor.', color: '#e6f6ff' });
          sfx.fanfare();
        } else if (e.bought) sfx.upgrade();
        festival.render();
        break;
      }
      case 'fleet': {
        const d = e.id ? SHIPS.find((x) => x.id === e.id) : undefined;
        if (e.phase === 'open') {
          fanfare.whenIdle(() =>
            fanfare.cheer({ icon: ICONS.fleet, kicker: 'Captain Vey', title: 'The drydock is open', sub: `“Eight of our ships can still fly. Help us rebuild them.” Vey left you ${FLEET.welcomePlates} hull plates. Open Prestige, Fleet.`, color: '#ffcf7a' }),
          );
          sfx.radio();
        } else if (e.phase === 'start' && d) {
          ui.toast(ICONS.fleet.replace('currentColor', hexColor(d.color)), `<b>${d.name}</b> is in the drydock`);
          sfx.upgrade();
        } else if (e.phase === 'launch' && d) {
          syncFleet(d.id);
          if (e.rank === 1) {
            fanfare.whenIdle(() => fanfare.cheer({ icon: ICONS.fleet, kicker: `The Hollow Fleet · ${shipsBuilt(game.state).length} of 8`, title: `The ${d.name} flies again`, sub: `${d.lore} ${powerText(d.power, 1)}`, color: hexColor(d.color) }));
            fanfare.confetti(['#ffcf7a', '#ffffff', hexColor(d.color)]);
            sfx.fanfare();
            buzz([30, 50, 30]);
          } else {
            ui.toast(ICONS.fleet.replace('currentColor', hexColor(d.color)), `<b>${d.name} reached rank ${e.rank}!</b> ${powerText(d.power, e.rank!)}`);
            sfx.achievement();
          }
          scene.celebrate(d.color);
        }
        break;
      }
      case 'plates':
        if (e.from === 'patrol') {
          ui.toast(ICONS.plate.replace('currentColor', '#ffcf7a'), `<b>Patrol's back!</b> +${e.n} hull plates`);
          sfx.coins();
        } else if (e.from !== 'boss') ui.toast(ICONS.plate.replace('currentColor', '#ffcf7a'), `<b>+${e.n} hull plates</b> for the drydock`);
        break;
      case 'visitor':
        syncVisitor();
        if (e.phase === 'arrived') {
          const v = visitorHere(game.state, Date.now());
          if (v) ui.toast(ICONS.heart.replace('currentColor', '#ff8fa8'), `<b>${v.def.name}</b> has docked with a favour to ask. Tap the banner`);
          sfx.event();
          buzz(20);
        } else ui.toast(ICONS.warp, 'The visitor flew on. Another will come by');
        break;
      case 'visit': {
        syncVisitor();
        ui.visitors.answered(e.result);
        if (e.result.scrap) ui.bigGain(e.result.scrap);
        if (e.result.friend) {
          fanfare.confetti(['#ff8fa8', '#ffffff', '#ffd166']);
          sfx.fanfare();
          buzz([30, 50, 30]);
        } else if (e.result.liked) {
          sfx.achievement();
          buzz(25);
        } else sfx.coins();
        if (e.result.surge) scene.celebrate(0x7cf0ff);
        break;
      }
      case 'whale': {
        const w = game.state.whale;
        switch (e.kind) {
          case 'egg':
            sfx.crate();
            fanfare.whenIdle(() => fanfare.cheer({ icon: ICONS.whale, kicker: 'Something in the crate', title: 'A warm egg!', sub: 'It hums when you hold it. It is floating by the station now: tap it to see.', color: '#7cf0ff' }));
            syncWhale();
            break;
          case 'warm':
            sfx.upgrade();
            break;
          case 'hatch':
            sfx.hatch();
            buzz(30);
            syncWhale(true);
            fanfare.whenIdle(() => {
              fanfare.cheer({ icon: ICONS.whale, kicker: 'The egg hatched', title: 'A baby space whale!', sub: 'It thinks the station is its mother. Give it a name.', color: '#7cf0ff' });
              window.setTimeout(() => whalePanel.openNaming(), 2800);
            });
            break;
          case 'fed':
            sfx.coins();
            scene.whalePet();
            buzz(12);
            syncPerks();
            break;
          case 'treat':
            ui.toast(ICONS.whale.replace('currentColor', '#7cf0ff'), `The crew saved <b>${esc(w.name)}</b> a treat from that ${e.from === 'fish' ? 'catch' : e.from === 'garden' ? 'harvest' : 'wreck'}`);
            scene.whalePet();
            break;
          case 'grow':
            sfx.whaleSong(e.stage.size);
            syncWhale();
            syncPerks();
            fanfare.whenIdle(() => fanfare.cheer({ icon: ICONS.whale, kicker: `${w.name} grew`, title: e.stage.name, sub: e.stage.gulp ? `Bigger, happier, and now gulps passing wrecks for ${e.stage.gulp} minutes of scrap.` : 'Bigger, and a little louder.', color: '#7cf0ff' }));
            break;
          case 'gulp':
            sfx.gulp();
            scene.whaleGulp(`+${fmt(e.value)}`);
            ui.toast(ICONS.whale.replace('currentColor', '#7cf0ff'), `<b>${esc(w.name)}</b> gulped a passing wreck: <b>+${fmt(e.value)}</b> scrap`);
            break;
          case 'song':
            if (e.phase === 'ready') ui.toast(ICONS.whale.replace('currentColor', '#7cf0ff'), `<b>${esc(w.name)} is singing.</b> Tap its button to listen`);
            break;
          case 'tow':
            sfx.whaleSong(1);
            scene.warpJump();
            window.setTimeout(() => {
              syncWhale();
              syncPerks();
              fanfare.cheer({ icon: ICONS.whale, kicker: 'The Nursery', title: `${w.name} brought you home`, sub: `A nebula full of whales and warm eggs. +${Math.round(WHALE.nurseryIncome * 100)}% income for good.`, color: '#7cf0ff' });
              window.setTimeout(() => whalePanel.open(true), 3000);
            }, JUMP_SWAP_MS.relocate + 600);
            break;
          default:
            break;
        }
        break;
      }
      case 'planet': {
        const p = game.state.planet;
        const tint = (icon: string) => icon.replace('currentColor', '#8ff0b0');
        switch (e.kind) {
          case 'found':
            sfx.radio();
            syncPlanet();
            fanfare.whenIdle(() => {
              fanfare.cheer({ icon: ICONS.planet, kicker: 'The scanners found something', title: 'A dead planet below!', sub: `Grey dust and old craters. Mika thinks salvage could bring ${p.name} back to life.`, color: '#8ff0b0' });
              window.setTimeout(() => planetPanel.open(true), 2800);
            });
            break;
          case 'pod':
            syncPerks();
            if (e.filled) ui.toast(tint(ICONS.planet), `Every pod has landed. <b>${esc(pathText(game.state, planetEra(game.state).projects[p.project]?.name ?? ''))}</b> is taking hold`);
            break;
          case 'settled':
            syncPerks();
            if (e.done.era) {
              sfx.fanfare();
              buzz(30);
              syncPlanet(true);
              scene.celebrate(0x8ff0b0);
              fanfare.whenIdle(() => fanfare.cheer({ icon: ICONS.planet, kicker: `${p.name} changed`, title: e.done.era!.name, sub: e.done.era!.look, color: '#8ff0b0' }));
            } else {
              sfx.achievement();
              syncPlanet();
              ui.toast(tint(ICONS.planet), `<b>${esc(pathText(game.state, e.done.project.name))}</b> took hold on ${esc(p.name)}. +3% income`);
            }
            break;
          case 'path': {
            const path = PLANET_PATHS.find((x) => x.id === p.path);
            sfx.achievement();
            syncPerks();
            syncPlanet(true);
            if (path) ui.toast(tint(ICONS.planet), `<b>${esc(path.name)}</b> it is. ${esc(path.gives)}`);
            break;
          }
          case 'shuttle':
            sfx.coins();
            scene.planetShuttle(`+${fmt(e.value)}`);
            ui.toast(tint(ICONS.planet), `A trade shuttle from <b>${esc(p.name)}</b> docked: <b>+${fmt(e.value)}</b> scrap`);
            break;
          case 'story':
            if (e.phase === 'ready' && !planetPanel.isOpen && p.stories > 0) ui.toast(tint(ICONS.planet), `<b>News from ${esc(p.name)}.</b> Tap its button to read`);
            break;
          default:
            break;
        }
        break;
      }
      case 'garden': {
        if (e.phase === 'plant') {
          sfx.buy();
          break;
        }
        const sn = e.crop.snack;
        ui.toast(ICONS.bolt.replace('currentColor', e.crop.color), `<b>${sn.name}!</b> ${sn.mult}x ${SNACK_TEXT[sn.kind]} for ${sn.minutes} minutes${e.crystals ? `, +${e.crystals} crystals` : ''}`);
        scene.celebrate(parseInt(e.crop.color.slice(1), 16));
        sfx.coins();
        buzz(20);
        syncPerks();
        break;
      }
      case 'rankTask': {
        const rank = currentRank(game.state);
        const more = e.left > 0 ? `${3 - e.left}/3 for ${rank?.title ?? 'the next rank'}` : `Promotion to ${rank?.title ?? 'the next rank'} is ready!`;
        ui.toast(ICONS.check.replace('currentColor', '#4fe3c1'), `<b>${e.task.text}</b> ${more}`);
        sfx.milestone();
        buzz(15);
        break;
      }
      case 'rankReady':
        sfx.achievement();
        buzz([15, 30, 15]);
        break;
      case 'rank': {
        const c = e.claim;
        fanfare.cheer({ icon: rankBadge(game.state.journey.rank, true), kicker: 'Promoted!', title: c.rank.title, sub: promotionText(c, fmt) + (c.rank.opens ? `<br>Now open: <b>${c.rank.opens}</b>` : ''), color: '#ffd166' });
        scene.fireworks([0xffd166, 0x5cd6ff, 0xffffff]);
        scene.celebrate(0xffd166);
        sfx.fanfare();
        buzz([30, 50, 30, 50, 60]);
        if (c.scrap.gt(0)) ui.bigGain(c.scrap);
        if (c.pet) {
          scene.setPet(game.state.pets.active, petTint());
          syncPerks();
        }
        if (c.paint) {
          // Put the new paint straight on, so the captain sees it.
          game.state.decor.paint = CAPTAIN_PAINT_ID;
          syncDecor();
        }
        break;
      }
      case 'dive':
        dive.showResult(e);
        if (e.scrap.gt(0)) ui.bigGain(e.scrap);
        if (e.best) sfx.fanfare();
        break;
      case 'bossEscape':
        scene.setBoss(null);
        ui.toast(ICONS.warp, '<b>The wreck flew away!</b> Break the next one within a minute.');
        sfx.event();
        break;
      case 'goldenSpawn':
        scene.spawnGolden();
        break;
      case 'golden':
        ui.toast(ICONS.star.replace('currentColor', '#ffd166'), `<b>Golden rush!</b> Everything earns ${GOLDEN.mult}x for ${GOLDEN.seconds * timeStretch(game.state)} seconds`);
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
      case 'comboMax':
        sfx.comboMax();
        buzz(15);
        break;
      case 'contract': {
        // A contract can change the crate rate (Crate Season), so the scene follows it.
        syncPerks();
        if (!e.id) break;
        const d = contractDef(e.id);
        const icon = ICONS.trophy.replace('currentColor', hexColor(d.color));
        if (e.phase === 'start') {
          ui.toast(icon, `<b>Contract: ${d.name}</b> ${goalText(game.state.contract!)}`);
          ui.showTab('build');
        } else if (e.phase === 'done') {
          sfx.fanfare();
          fanfare.confetti();
          fanfare.cheer({ icon, kicker: 'Contract met', title: d.name, sub: `+${CONTRACT_CRYSTALS} crystals and +2% income for good. The rule stays until you relocate.`, color: hexColor(d.color) });
          buzz([30, 40, 30]);
        } else ui.toast(icon, `<b>Contract missed</b> The ${d.name} clock ran out. Its rule is lifted.`);
        break;
      }
      case 'challenge': {
        const c = CHALLENGES.find((x) => x.id === e.id)!;
        if (e.phase === 'start') {
          scene.warpJump();
          cinematic(JUMP_SWAP_MS.relocate);
          setTimeout(() => {
            scene.setOwned(game.state.owned);
            syncGrowth();
            scene.setSector(sectorFor(game.state.stats.relocations));
          }, JUMP_SWAP_MS.relocate);
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

  /** When the scene was last tapped, so a burst of taps is never turned into opening a window. */
  let lastSceneTap = -1e9;
  const TAP_STREAK_MS = 900;
  sceneEl.addEventListener('pointerdown', (ev) => {
    const rect = sceneEl.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (scene.traderAt(x, y) && meta.traderHere(game.state, Date.now())) {
      ui.openTrader();
      buzz(10);
      return;
    }
    // While the captain is tapping away, the planet and the whale never pop a window open over the
    // station: those taps stay claw taps (and still pet the whale). A calm single tap opens them.
    const now = performance.now();
    const tapping = now - lastSceneTap < TAP_STREAK_MS;
    lastSceneTap = now;
    const calm = !tapping && !game.state.boss;
    const onWhale = game.state.tutorial < 0 ? scene.whaleAt(x, y) : null;
    const onPlanet = game.state.tutorial < 0 && game.state.planet.found && scene.planetAt(x, y);
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
      const p = game.collectBonus();
      const text = p.kind === 'scrap' || p.kind === 'haul' ? `+${fmt(p.amount)}` : p.kind === 'buff' ? CRATE_BUFFS[p.id].name + '!' : p.kind === 'swarm' ? 'Swarm!' : p.kind === 'crystals' ? `+${p.amount} crystals` : 'Overdrive ready!';
      scene.floatText(Math.max(-70, Math.min(70, scene.lastHit.x)), scene.lastHit.y - 20, text, true);
      buzz(25);
      return;
    }
    if (hit === 'mini') {
      const v = game.collectMini();
      scene.floatText(scene.lastHit.x, scene.lastHit.y, `+${fmt(v)}`);
      buzz(10);
      return;
    }
    if (hit === 'meteor') {
      const v = game.smashMeteor();
      scene.floatText(scene.lastHit.x, scene.lastHit.y, `+${fmt(v)}`);
      buzz(15);
      return;
    }
    if (hit === 'star') {
      const p = game.catchStar();
      const text = p.kind === 'crystals' ? `+${p.amount} crystals` : p.kind === 'overdrive' ? 'Free Overdrive!' : `+${fmt(p.amount)}`;
      scene.floatText(scene.lastHit.x, scene.lastHit.y, text, true);
      buzz([20, 40, 60]);
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
    // Crates, meteors and the rest drifting in front of them are caught first (above).
    if (onWhale === 'egg' && calm) {
      whalePanel.open();
      buzz(10);
      return;
    }
    if (onWhale === 'whale') {
      if (game.petWhale()) {
        scene.whalePet();
        sfx.whaleSong(whaleStage(game.state).size, true);
        buzz(8);
      } else if (calm) {
        whalePanel.open();
        return;
      }
    } else if (onPlanet && calm) {
      planetPanel.open();
      buzz(10);
      return;
    }
    if (scene.pokeCrew(x, y)) buzz(6);
    const value = game.tap();
    if (game.state.taps >= TUTORIAL_TAPS) game.advanceTutorial('tap');
    scene.tapAt(x, y, `+${fmt(value)}`, game.heatNow());
    ui.bumpScrap();
    sfx.tap();
    buzz(8);
  });

  // Computers: Space taps the middle of the station, other keys press buttons (ui/keys.ts).
  setupKeys({
    tap: () => {
      const r = stage.getBoundingClientRect();
      const init = { pointerId: 9999, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      sceneEl.dispatchEvent(new PointerEvent('pointerdown', init));
      sceneEl.dispatchEvent(new PointerEvent('pointerup', init));
    },
    inTutorial: () => game.state.tutorial >= 0,
  });
  setupTabTitle(game);
  setupInstall((text) => ui.toast(ICONS.star.replace('currentColor', '#ffd166'), text));
  // Hide the vibration switch where nothing can vibrate (computers, iPhone browsers).
  if (!canVibrate()) document.getElementById('opt-haptics')?.closest('label')?.setAttribute('hidden', '');

  scene.setSector(sectorFor(game.state.stats.relocations));
  scene.setRig(game.state.rig);
  scene.setGalaxy(game.state.galaxy.shifts);
  game.start();
  scene.setEvent(meta.eventActive(game.state, Date.now()));
  scene.setPet(game.state.pets.active, petTint());
  if (game.state.boss) scene.setBoss(game.state.boss.name);
  scene.setTrader(meta.traderHere(game.state, Date.now()));
  scene.setOrnaments(game.state.ornaments.on);
  scene.setLantern(storyDone(game.state));
  scene.setTank(tankCritters(game.state));
  syncFleet();
  syncVisitor();
  syncWhale();
  syncPlanet();
  syncMusic();

  // Combo heat meter (core/combo.ts), redrawn only when it moves.
  const comboEl = document.getElementById('combo')!;
  const comboFill = document.getElementById('combo-fill')!;
  const comboX = document.getElementById('combo-x')!;
  let comboShown = -1;
  const renderCombo = (now: number) => {
    const h = Math.round(game.heatNow(now) * 100) / 100;
    if (h === comboShown) return;
    comboShown = h;
    comboEl.hidden = h < 0.02 || game.state.challenge === 'notap';
    comboEl.classList.toggle('hot', h >= 1);
    comboFill.style.height = `${h * 100}%`;
    comboX.textContent = `x${comboMult(h).toFixed(1)}`;
  };

  let lastUi = 0;
  let lastFrame = performance.now();
  // The game loop has its own animation frame, separate from the renderer's.
  const loop = () => {
    requestAnimationFrame(loop);
    const now = Date.now();
    const t = performance.now();
    // While idle (or on battery saver) the HUD keeps pace with the station at 30 fps.
    if (scene.idle && t - lastFrame < 30) return;
    game.update(now);
    scene.setBoost(eco.boostActive(game.state, now));
    scene.holdCrate = game.tutorialStep === 'crate';
    scene.starsAllowed = game.state.tutorial < 0;
    scene.setBossHealth(meta.bossHealth(game.state));
    // A relocation, challenge or galaxy shift clears the wreck without a goodbye; send it off here.
    if (!game.state.boss) scene.setBoss(null);
    ui.renderHud((t - lastFrame) / 1000);
    renderCombo(now);
    lastFrame = t;
    if (now - lastUi > 100) {
      lastUi = now;
      ui.render();
      festival.render();
      fishing.render();
      dive.render();
      journey.render();
      whalePanel.render();
      syncWhale();
      planetPanel.render();
      syncPlanet();
      if (game.state.whale.phase === 'born' && now > nextSong && document.visibilityState === 'visible') {
        nextSong = now + 70_000 + Math.random() * 90_000;
        sfx.whaleSong(whaleStage(game.state).size);
      }
      syncCrew();
      scene.crewChatter = game.state.tutorial < 0 && !introShowing();
      syncFestival();
      syncMusic();
    }
  };
  requestAnimationFrame(loop);

  const save = () => game.save();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      save();
      void scheduleReminders(game.state);
    } else void cancelReminders();
  });
  void cancelReminders();
  // In the Android app, ask once for notification permission, ten minutes into a new captain's play.
  if (notificationsAvailable()) {
    const ask = window.setInterval(() => {
      const s = game.state;
      if (s.tips.has('notify-asked')) return window.clearInterval(ask);
      if (s.tutorial >= 0 || s.stats.playSec < 600) return;
      s.tips.add('notify-asked');
      window.clearInterval(ask);
      void askPermission().then((ok) => (s.settings.notifications = ok));
    }, 10_000);
  }
  window.addEventListener('pagehide', save);
}

boot();
