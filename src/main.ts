import { askPermission, cancelReminders, notificationsAvailable, scheduleReminders } from './notify';
import { WEEKLIES, allPaints, weeklyOn } from './core/weekly';
import { GROWTH, growthStage } from './core/growth';
import { GROUP_NAMES } from './ui/panes';
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
import { shakeBossBanner, showBossAlert } from './ui/meta-ui';
import { SafeGame, safeText } from './ui/book-ui';
import { galaxyText } from './ui/galaxy-ui';
import { tradeText } from './ui/trade-ui';
import { UI, fmtSpeed } from './ui/ui';
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
  if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __game: game });
  ui.onComfortChange = (reduceFlash, reduceShake) => scene.setComfort(reduceFlash, reduceShake);
  ui.onPowerChange = (saver) => scene.setBatterySaver(saver);
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
  scene.setBatterySaver(game.state.settings.batterySaver);
  const syncPerks = () =>
    scene.setCrateRate((eco.hasPerk(game.state, 'magnet') ? 2 : 1) * eco.researchProduct(game.state, 'crateRate') * (meta.petActive(game.state, 'pup') ? 1.5 : 1) * sectorCrateMult(game.state) * contractCrateMult(game.state) * (weeklyOn(game.state, 'comets') ? 2 : 1));
  syncPerks();
  const syncDecor = () => {
    const s = game.state;
    scene.setTheme(THEMES.find((t) => t.id === s.decor.theme) ?? THEMES[0], (allPaints().find((p) => p.id === s.decor.paint) ?? PAINTS[0]).tint, SKINS.find((k) => k.id === s.skin) ?? null);
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
        if (e.kind === 'overdrive') ui.toast(ICONS.bolt.replace('currentColor', '#ff6b9a'), '<b>Overdrive recharged!</b> Fire it when you are ready');
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
              sub: `+${e.stars.toLocaleString('en-US')} Galaxy Stars. Every star ever earned powers the station, and the Star Map has new upgrades to buy.`,
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
    const value = game.tap();
    if (game.state.taps >= TUTORIAL_TAPS) game.advanceTutorial('tap');
    scene.tapAt(x, y, `+${fmt(value)}`, game.heatNow());
    ui.bumpScrap();
    sfx.tap();
    buzz(8);
  });

  scene.setSector(sectorFor(game.state.stats.relocations));
  scene.setRig(game.state.rig);
  scene.setGalaxy(game.state.galaxy.shifts);
  game.start();
  scene.setEvent(meta.eventActive(game.state, Date.now()));
  scene.setPet(game.state.pets.active, petTint());
  if (game.state.boss) scene.setBoss(game.state.boss.name);
  scene.setTrader(meta.traderHere(game.state, Date.now()));
  scene.setOrnaments(game.state.ornaments.on);

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
  // In the Android app, ask once for notification permission a minute after the tutorial.
  if (notificationsAvailable()) {
    const ask = window.setInterval(() => {
      const s = game.state;
      if (s.tips.has('notify-asked')) return window.clearInterval(ask);
      if (s.tutorial >= 0 || s.stats.playSec < 60) return;
      s.tips.add('notify-asked');
      window.clearInterval(ask);
      void askPermission().then((ok) => (s.settings.notifications = ok));
    }, 10_000);
  }
  window.addEventListener('pagehide', save);
}

boot();
