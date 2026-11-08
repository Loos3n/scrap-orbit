import { P, arc, cel, circ, ell, facetStar, fill, glint, glow, line, n, ngon, outline, poly, rrect, sector, tube, type Ramp } from '../art/kit';

/**
 * The station's hard-surface sprites, drawn with the same kit and house style as the menu
 * icons (see src/art/kit.ts). Each returns markup in design units; art.ts paints it at
 * `1 / scale` world units per design unit, so outlines come out at a similar weight on screen
 * whatever the sprite's size. Sizes and facing match the sprites they replaced.
 */
export interface SpriteArt {
  /** Size in world units. */
  w: number;
  h: number;
  /** Design units per world unit. */
  scale: number;
  markup: string;
  /** Canvas pixels per world unit, when the default is more than a big sprite needs. */
  res?: number;
  /** Skip the grain and wear pass (for big, thin sprites). */
  plain?: boolean;
}

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** A status light: a dark rim, the colour and a white glint. */
const lamp = (x: number, y: number, r: number, color: string) =>
  glow(x, y, r * 2.6, color, 0.55) + fill(circ(x, y, r + 0.7), '#0b0e2a', ' opacity=".6"') + fill(circ(x, y, r), color) + fill(circ(x - r * 0.35, y - r * 0.35, r * 0.4), '#fff');

/** Salvage drone, pointing right. */
export function drone(): SpriteArt {
  const m = [
    glow(5, 21, 6, P.teal.base, 0.7),
    fill(ell(5, 21, 3, 2.4), '#fff'),
    cel(rrect(6, 16, 7, 10, 2.5), P.steel, [9.5, 21, 5], { hl: 0, ink: 1.8 }),
    cel(poly(17, 14, 8, 3, 15.5, 3, 28, 12.5), P.teal, [17, 9, 7], { hl: 0, ink: 1.8, detail: fill(poly(8, 3, 15.5, 3, 14.5, 5.5, 9.6, 5.5), P.gold.base) }),
    cel(poly(17, 28, 8, 39, 15.5, 39, 28, 29.5), P.teal, [17, 33, 7], { hl: 0, ink: 1.8, detail: fill(poly(8, 39, 15.5, 39, 14.5, 36.5, 9.6, 36.5), P.gold.base) }),
    tube('M43 17L48.5 12.5L52 16M43 25L48.5 29.5L52 26', P.steel, 2),
    cel(ell(27, 21, 17.5, 12), P.teal, [27, 21, 13], {
      detail:
        line('M14 27.5Q27 33 40 27.5', P.teal.lo, 1.6) +
        line('M17 10.5V31.5', P.teal.lo, 1, ' opacity=".7"') +
        fill(ell(31.5, 19.5, 8.2, 7.2), P.teal.ink) +
        fill(ell(31.5, 19.5, 6.4, 5.4), '#2fd6b6', ' opacity=".55"') +
        fill(ell(31.5, 19.5, 4.6, 3.9), '#9dfff0') +
        fill(ell(29.8, 17.8, 1.8, 1.2), '#fff') +
        lamp(37, 28.5, 1.4, P.red.base),
    }),
  ].join('');
  return { w: 18, h: 14, scale: 3, markup: m };
}

/** Cargo hauler, pointing right: engine, a spine of containers and a cab. */
export function hauler(): SpriteArt {
  const colors = [P.orange, P.gold, P.teal, P.purple];
  const boxes: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (const [row, y] of [[0, 6.5], [1, 28.5]] as const) {
      const x = 15 + i * 13.6;
      const c = colors[(i + row * 2) % 4];
      boxes.push(
        cel(rrect(x, y, 12.4, 13, 1.8), c, [x + 6.2, y + 6.5, 6], {
          hl: 0,
          ink: 1.6,
          detail: line(`M${n(x + 3.2)} ${y + 2.5}V${y + 10.5}M${n(x + 6.2)} ${y + 2.5}V${y + 10.5}M${n(x + 9.2)} ${y + 2.5}V${y + 10.5}`, c.lo, 0.9),
        }),
      );
    }
  }
  const m = [
    glow(4, 24, 9, P.orange.base, 0.7),
    fill(ell(4, 24, 3.5, 6), '#ffe9a8'),
    cel(poly(15, 15, 4, 9.5, 4, 38.5, 15, 33), P.steel, [10, 24, 9], { hl: 0, ink: 1.8, detail: line('M8 12V36M11.5 13.5V34.5', P.steel.lo, 1) }),
    cel(rrect(13, 20, 60, 8, 2), P.hull, [43, 24, 6], { hl: 0, ink: 1.6, detail: line('M17 20L22 28M27 20L32 28M37 20L42 28M47 20L52 28M57 20L62 28', P.hull.lo, 0.9) }),
    ...boxes,
    cel('M70 10H80Q96 24 80 38H70Z', P.blue, [80, 24, 12], {
      hl: 0.4,
      detail:
        line('M75 11V37', P.blue.lo, 1) +
        fill(ell(84, 22, 6.2, 7.4), P.cyan.ink) +
        fill(ell(84, 22, 4.6, 5.8), P.cyan.base) +
        fill(ell(82.6, 19.8, 1.4, 2), '#fff'),
    }),
    lamp(91.5, 24, 1.3, P.gold.base),
    lamp(71.5, 36, 1.1, P.red.base),
  ].join('');
  return { w: 32, h: 16, scale: 3, markup: m };
}

/** Smelter pod: a squat furnace with a glowing grill. Faces outward (right). */
export function smelter(): SpriteArt {
  const m = [
    cel(rrect(6, 5, 16, 11, 2.5), P.steel, [14, 10.5, 6], { hl: 0, ink: 1.8, detail: fill(rrect(8.5, 5.5, 11, 2.6, 1.2), P.steel.ink) }),
    cel(rrect(6, 50, 16, 11, 2.5), P.steel, [14, 55.5, 6], { hl: 0, ink: 1.8, detail: fill(rrect(8.5, 57.9, 11, 2.6, 1.2), P.steel.ink) }),
    cel(rrect(3, 9, 60, 48, 15), P.orange, [33, 33, 24], {
      hl: 0.3,
      hlOp: 0.35,
      detail:
        fill(rrect(12, 18, 42, 30, 8), P.orange.ink) +
        glow(33, 33, 20, '#ffb547', 0.5) +
        fill(rrect(16, 22, 34, 22, 5.5), '#ffb547') +
        fill(rrect(19.5, 24.5, 27, 13, 5), '#ffe9a8') +
        line('M23 22V44M29.5 22V44M36 22V44M42.5 22V44', P.orange.lo, 2.4) +
        line('M57 19v3M57 27v3M57 35v3M57 43v3', P.orange.ink, 2.4, ' opacity=".8"') +
        [14, 52].flatMap((x) => [14, 52].map((y) => fill(circ(x, y, 1.3), P.orange.hi))).join(''),
    }),
    lamp(9.5, 15.5, 1.4, P.green.base),
  ].join('');
  return { w: 22, h: 22, scale: 3, markup: m };
}

/** Fabricator: a hex block with a glowing printer eye. */
export function fabricator(): SpriteArt {
  const m = [
    cel(ngon(30, 30, 28, 6), P.purple, [30, 30, 26], {
      detail:
        line(ngon(30, 30, 18.5, 6), P.purple.lo, 1.4) +
        fill(circ(30, 30, 13.5), P.purple.ink) +
        fill(circ(30, 30, 11.5), '#3a1f6e') +
        glow(30, 30, 10, '#d9b8ff', 0.7) +
        fill(circ(30, 30, 4.4), '#fff') +
        lamp(46, 20, 1.5, P.teal.base) +
        lamp(46, 40, 1.5, P.gold.base),
    }),
  ].join('');
  return { w: 20, h: 20, scale: 3, markup: m };
}

/** One 30-degree section of the orbital dock ring, centred on a canvas the size of the ring. */
export function dockSegment(radius: number): SpriteArt {
  const c = radius + 10;
  const a0 = -13.3;
  const a1 = 13.3;
  const braces: string[] = [];
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const t0 = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    const t1 = ((a0 + ((a1 - a0) * (i + 1)) / steps) * Math.PI) / 180;
    braces.push(`M${n(c + Math.cos(t0) * (radius - 4))} ${n(c + Math.sin(t0) * (radius - 4))}L${n(c + Math.cos(t1) * (radius + 4))} ${n(c + Math.sin(t1) * (radius + 4))}`);
  }
  const brace = braces.join('');
  const m = [
    line(brace, P.gold.ink, 1.9),
    line(brace, P.gold.base, 0.9),
    ...[radius - 4, radius + 4].map((r) => line(arc(c, c, r, a0, a1), P.gold.ink, 3.4) + line(arc(c, c, r, a0, a1), P.gold.lo, 2.2) + line(arc(c, c, r - 0.4, a0, a1), P.gold.base, 1.2)),
    cel(rrect(c + radius - 7, c - 5, 14, 10, 2), P.gold, [c + radius, c, 6], { hl: 0, ink: 1.2, detail: line(`M${c + radius - 3} ${c - 5}V${c + 5}`, P.gold.lo, 0.8) }),
    lamp(c + radius + 4.2, c, 1.2, P.pink.base),
  ].join('');
  return { w: radius * 2 + 20, h: radius * 2 + 20, scale: 1, markup: m, res: 2.5, plain: true };
}

/** Laser turret on a base plate, barrel pointing up (the scene rotates it to aim). */
export function laserTurret(): SpriteArt {
  const m = [
    cel(rrect(6, 48, 44, 16, 6), P.steel, [28, 56, 14], { hl: 0, ink: 2, detail: line('M12 56h32', P.steel.lo, 1.6, ' stroke-dasharray="3 3"') }),
    tube('M28 42V11', P.steel, 9),
    line('M28 12V6.5', P.red.ink, 11.4),
    line('M28 12V6.5', P.red.base, 9),
    line('M26 12V6.5', P.red.hi, 2, ' opacity=".8"'),
    glow(28, 5, 7, P.red.base, 0.7),
    glint(28, 5, 3.5),
    cel('M10 48A18 18 0 0 1 46 48Z', P.red, [28, 40, 15], {
      detail: fill(circ(28, 39.5, 5), P.red.ink) + fill(circ(28, 39.5, 3.2), '#ffb3ba') + fill(circ(27, 38.5, 1.2), '#fff'),
    }),
  ].join('');
  return { w: 28, h: 34, scale: 2, markup: m };
}

/** The warp gate's ring with clamps. The portal inside is a separate glow sprite. */
export function warpGate(): SpriteArt {
  const c = 60;
  const clamps: string[] = [];
  for (let i = 0; i < 8; i++) {
    clamps.push(
      `<g transform="translate(${n(c + Math.cos((i / 8) * Math.PI * 2) * 48)} ${n(c + Math.sin((i / 8) * Math.PI * 2) * 48)}) rotate(${i * 45})">` +
        cel(rrect(-7.5, -5.5, 15, 11, 2.5), P.steel, [0, 0, 6], { hl: 0, ink: 1.8, detail: fill(circ(3.6, 0, 1.8), i % 2 ? P.sun.base : P.violet.base) }) +
        '</g>',
    );
  }
  const m = [
    line(circ(c, c, 48), P.violet.ink, 14),
    line(circ(c, c, 48), P.violet.lo, 11),
    line(arc(c, c, 47.3, 100, 350), P.violet.base, 8, ' transform="translate(-.8 -.8)"'),
    line(arc(c, c, 51.5, 190, 290), P.violet.hi, 2, ' opacity=".8"'),
    line(circ(c, c, 44.5), P.violet.ink, 1.2, ' opacity=".7"'),
    ...clamps,
  ].join('');
  return { w: 120, h: 120, scale: 1, markup: m };
}

/** One curved collector panel of the Dyson swarm, centred on its arc. */
export function dysonPanel(): SpriteArt {
  const outer = 'M2 18Q30 2 58 18L54 22Q30 8 6 22Z';
  const m = [
    fill(outer, P.gold.lo),
    fill(outer, P.gold.base, ' transform="translate(-.6 -.6)"'),
    fill('M9 17.6Q30 6 51 17.6L49 19.4Q30 9.6 11 19.4Z', P.navy.lo),
    line('M9.5 17.8Q30 6.6 50.5 17.8', P.navy.hi, 0.8, ' opacity=".6"'),
    line('M17 12.4V16M24 9.6V13M30 8.6V12.2M36 9.6V13M43 12.4V16', P.gold.base, 1.1),
    outline(outer, P.gold.ink, 1.6),
  ].join('');
  return { w: 30, h: 12, scale: 2, markup: m };
}

/** The station's hull: plated disc, window band, hazard mounts and the reactor socket. */
export function hull(): SpriteArt {
  const c = 70;
  const r = rand(11);
  const H: Ramp = P.hull;
  const plates: string[] = [];
  for (let i = 0; i < 18; i++) {
    const a0 = i * 20 + 1;
    const a1 = a0 + 18;
    const mid = a0 + 9;
    // The claw (top) and antenna (bottom) mounts get hazard plates instead.
    if (Math.abs(mid - 270) < 12 || Math.abs(mid - 90) < 12) continue;
    const tone = i % 3 === 0 ? fill(sector(c, c, 54, 49.5, a0, a1), H.lo, ' opacity=".55"') : i % 3 === 1 ? fill(sector(c, c, 54, 49.5, a0, a1), H.hi, ' opacity=".18"') : '';
    plates.push(tone + fill(sector(c, c, 42.5, 38.5, a0, a1), i % 2 ? H.lo : H.base, ' opacity=".5"'));
  }
  const hazard = (mid: number) => {
    let s = '';
    for (let k = 0; k < 8; k++) s += fill(sector(c, c, 54, 49.5, mid - 12 + k * 3, mid - 9 + k * 3), k % 2 ? '#2a1e10' : P.gold.base);
    return s + outline(sector(c, c, 54, 49.5, mid - 12, mid + 12), P.gold.ink, 0.9);
  };
  const windows: string[] = [];
  for (let i = 0; i < 44; i++) {
    if (r() < 0.2) continue;
    const a = (i / 44) * Math.PI * 2;
    const lit = r() < 0.78;
    const col = lit ? (r() < 0.8 ? P.gold.hi : P.cyan.base) : H.lo;
    windows.push(`<g transform="translate(${n(c + Math.cos(a) * 46)} ${n(c + Math.sin(a) * 46)}) rotate(${n((a * 180) / Math.PI)})">${fill(rrect(-1.1, -1.5, 2.2, 3, 0.7), col)}</g>`);
  }
  const rivets: string[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    rivets.push(fill(circ(c + Math.cos(a) * 58, c + Math.sin(a) * 58, 0.75), H.hi, ' opacity=".55"'));
  }
  const m = [
    fill(circ(c + 4, c + 6, 63), '#02021a', ' opacity=".45"'),
    cel(circ(c, c, 62), H, [c, c, 62], {
      hl: 0.55,
      hlOp: 0.3,
      detail:
        plates.join('') +
        hazard(270) +
        hazard(90) +
        line(circ(c, c, 46), '#0b0e2a', 4.6, ' opacity=".75"') +
        windows.join('') +
        rivets.join('') +
        [54, 49.5, 42.5].map((rad) => line(circ(c, c, rad), H.ink, 0.8, ' opacity=".55"')).join('') +
        line(arc(c, c, 55, 185, 265), H.hi, 1, ' opacity=".55"') +
        line(arc(c, c, 59.6, 190, 260), H.hi, 1.8, ' opacity=".7"') +
        fill(circ(c, c, 39.2), H.ink) +
        fill(circ(c, c, 38), '#0e1038') +
        fill(circ(c, c, 33), '#05061a') +
        line(arc(c, c, 37, 10, 100), H.base, 1.2, ' opacity=".6"'),
      ink: 2.4,
    }),
  ].join('');
  return { w: 140, h: 140, scale: 1, markup: m };
}

/** The rotating habitat ring: eight lit modules and four spokes. Lit evenly; it turns. */
export function habitatRing(): SpriteArt {
  const c = 62;
  const mods: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a0 = i * 45 + 4.5;
    const a1 = a0 + 36;
    const d = arc(c, c, 56, a0, a1);
    mods.push(line(d, P.steel.ink, 9) + line(d, P.steel.lo, 7.4) + line(d, P.steel.base, 4.8) + line(d, P.steel.hi, 1.2, ' opacity=".8"'));
    for (let k = 1; k < 7; k++) {
      const a = ((a0 + ((a1 - a0) * k) / 7) * Math.PI) / 180;
      mods.push(fill(circ(c + Math.cos(a) * 57.6, c + Math.sin(a) * 57.6, 0.85), k % 3 === 0 ? P.cyan.base : P.gold.hi));
    }
  }
  const spokes: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = ((i * 90 + 22.5) * Math.PI) / 180;
    spokes.push(`M${n(c + Math.cos(a) * 45)} ${n(c + Math.sin(a) * 45)}L${n(c + Math.cos(a) * 51.5)} ${n(c + Math.sin(a) * 51.5)}`);
  }
  const sp = spokes.join('');
  return { w: 124, h: 124, scale: 1, markup: line(sp, P.steel.ink, 3.4) + line(sp, P.steel.base, 1.6) + mods.join('') };
}

/** A solar array wing: a boom and two panels of cells. Attached at its left end. */
export function solarWing(): SpriteArt {
  const r = rand(19);
  const panel = (x0: number) => {
    let cells = '';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const v = r();
        const col = v < 0.33 ? P.navy.base : v < 0.66 ? '#3048a8' : '#4262c8';
        cells += fill(rrect(x0 + 3 + i * 9.5, 4 + j * 8.8, 8.6, 7.9, 1), col);
      }
    }
    return (
      cel(rrect(x0, 1, 44, 58, 3), P.gold, [x0 + 22, 30, 22], {
        hl: 0,
        ink: 1.8,
        detail: fill(rrect(x0 + 2.5, 3.5, 39, 53, 1.5), P.navy.ink) + cells + fill(poly(x0 + 3, 4, x0 + 22, 4, x0 + 3, 30), '#fff', ' opacity=".14"'),
      })
    );
  };
  const m = [tube('M0 30H40', P.hull, 9), line('M9 25v10M21 25v10', P.hull.ink, 2.2), panel(38), panel(84), cel(rrect(81, 24, 5, 12, 1.5), P.hull, [83.5, 30, 3], { hl: 0, ink: 1.4 })].join('');
  return { w: 64, h: 30, scale: 2, markup: m };
}

/** The salvage claw on top of the station. Anchored at its base (bottom middle). */
export function claw(): SpriteArt {
  const m = [
    tube('M40 90V40', P.hull, 13),
    line('M33 62h14', P.hull.ink, 2.2),
    tube('M34 32L16 13L27 4M46 32L64 13L53 4', P.gold, 7),
    cel(circ(40, 36, 10), P.steel, [40, 36, 10], { detail: fill(circ(40, 36, 3.6), P.steel.ink) }),
  ].join('');
  return { w: 40, h: 46, scale: 2, markup: m };
}

/** Comms mast with a dish, hanging below the hull. Anchored at its top. */
export function antenna(): SpriteArt {
  const m = [
    tube('M40 0V44', P.hull, 7),
    line('M37 6L43 14M37 18L43 26M37 30L43 38', P.hull.ink, 1, ' opacity=".7"'),
    `<g transform="translate(40 52) rotate(28.6)">`,
    cel('M-24 0A24 10 0 0 0 24 0Z', P.steel, [0, 3, 14], { hl: 0.4, ink: 2 }),
    tube('M0 0V17', P.steel, 2),
    lamp(0, 19, 2.6, P.pink.base),
    '</g>',
  ].join('');
  return { w: 40, h: 40, scale: 2, markup: m };
}

/** The salvage crate that drifts past to be tapped. */
export function crate(): SpriteArt {
  const box = rrect(6, 6, 44, 44, 8);
  const m = cel(box, P.gold, [28, 28, 22], {
    hl: 0.4,
    hlOp: 0.45,
    detail:
      fill(rrect(24, 7, 8, 42, 1), P.gold.lo, ' opacity=".7"') +
      fill(rrect(7, 24, 42, 8, 1), P.gold.lo, ' opacity=".7"') +
      line(rrect(10.5, 10.5, 35, 35, 5), P.gold.lo, 1.4, ' opacity=".6"') +
      fill(circ(28, 28, 6.4), P.gold.ink) +
      fill(circ(28, 28, 4.8), P.sun.hi) +
      glint(15, 15, 3),
    ink: 2.4,
  });
  return { w: 28, h: 28, scale: 2, markup: m };
}

/** The golden crate: a bright box with a faceted star. */
export function goldenCrate(): SpriteArt {
  const m =
    glow(32, 32, 30, P.gold.base, 0.35) +
    cel(rrect(6, 6, 52, 52, 12), P.gold, [32, 32, 26], {
      hl: 0.45,
      hlOp: 0.6,
      detail: line(rrect(11.5, 11.5, 41, 41, 8), P.gold.hi, 2, ' opacity=".9"') + line(rrect(13.5, 13.5, 37, 37, 6.5), P.gold.lo, 1.2, ' opacity=".7"') + facetStar(32, 33, 15.5, 6.5, 5, { hi: '#ffffff', base: '#fff3c9', lo: '#ffb547', ink: P.gold.ink }) + glint(17, 16, 3.4),
      ink: 2.4,
    });
  return { w: 32, h: 32, scale: 2, markup: m };
}

/** A gravity well: a dark eye with cyan spiral arms (the scene spins it). */
export function vortex(): SpriteArt {
  const c = 45;
  const arms: string[] = [];
  for (let arm = 0; arm < 4; arm++) {
    let d = '';
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = ((arm * 90 + t * 300) * Math.PI) / 180;
      const r = 11 + t * 30;
      d += `${i ? 'L' : 'M'}${n(c + Math.cos(a) * r)} ${n(c + Math.sin(a) * r)}`;
    }
    arms.push(line(d, P.cyan.ink, 4.4, ' opacity=".55"') + line(d, P.cyan.lo, 2.8, ' opacity=".85"') + line(d, P.cyan.base, 1.4));
  }
  const m = [
    glow(c, c, 44, P.cyan.base, 0.3),
    ...arms,
    glow(c, c, 16, P.cyan.base, 0.6),
    cel(circ(c, c, 10.5), P.dark, [c, c, 10.5], {
      hl: 0.35,
      hlOp: 0.35,
      detail: line(arc(c, c, 8.8, 190, 280), P.cyan.hi, 1.6) + fill(circ(c, c, 4.5), '#03050f'),
      ink: 1.8,
    }),
  ].join('');
  return { w: 90, h: 90, scale: 1, markup: m, res: 3 };
}
