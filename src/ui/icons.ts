import type { GeneratorId } from '../core/config';
import { P, circ, ell, rrect, poly, ngon, fill, line, outline, glint, glow, cel, tube, facetStar, n, svg } from '../art/kit';

/**
 * The menu art set, drawn as inline SVG on a 48x48 grid with the drawing kit in
 * src/art/kit.ts (which explains the house style).
 *
 * Plain glyphs (tabs, buttons, toasts) take their colour from CSS: each one wraps its parts in
 * a single `<g color="currentColor">`, so `.replace('currentColor', '#hex')` tints the whole glyph.
 */

// ---------------------------------------------------------------- machines

const drone = () =>
  [
    line('M24 14V7', P.steel.ink, 2.6),
    line('M24 14V7', P.steel.base, 1.2),
    cel(circ(24, 6, 2.6), P.gold, [24, 6, 2.6], { hl: 0, ink: 1.6 }),
    tube('M19 34L15.5 41.5M29 34L32.5 41.5', P.steel, 2.2),
    glow(10.5, 36, 5, P.teal.base, 0.6),
    glow(37.5, 36, 5, P.teal.base, 0.6),
    cel(ell(10.5, 28, 4.6, 7), P.steel, [10.5, 28, 5.5], { ink: 1.8 }),
    cel(ell(37.5, 28, 4.6, 7), P.steel, [37.5, 28, 5.5], { ink: 1.8 }),
    cel(ell(24, 26, 13.5, 11), P.teal, [24, 26, 12], {
      detail:
        line('M13.5 30.5Q24 36 34.5 30.5', P.teal.lo, 1.6) +
        fill(circ(24, 23.5, 6.4), P.teal.ink) +
        fill(circ(24, 23.5, 4.6), '#2fd6b6', ' opacity=".5"') +
        fill(circ(24, 23.5, 3.3), '#9dfff0') +
        fill(circ(22.6, 22, 1.3), '#fff'),
    }),
  ].join('');

const hauler = () =>
  [
    glow(6, 27, 6, P.cyan.base, 0.7),
    fill(ell(5.5, 27, 3.4, 2.2), '#fff'),
    cel(rrect(7, 20.5, 6, 13, 2), P.steel, [10, 27, 5], { hl: 0, ink: 1.8 }),
    cel(rrect(11, 11, 7.5, 9, 1.8), P.orange, [14.75, 15.5, 4.5], { hl: 0, ink: 1.6, detail: line('M11.5 15.5h6.5', P.orange.lo, 1.2) }),
    cel(rrect(18.5, 11, 7.5, 9, 1.8), P.gold, [22.25, 15.5, 4.5], { hl: 0, ink: 1.6, detail: line('M19 15.5h6.5', P.gold.lo, 1.2) }),
    cel(rrect(26, 13, 6, 7, 1.6), P.teal, [29, 16.5, 3.5], { hl: 0, ink: 1.6 }),
    cel(rrect(11, 19.5, 24, 16, 4), P.blue, [23, 27.5, 11], {
      detail: line('M14 30h18', P.blue.lo, 1.4) + [16, 21, 26, 31].map((x) => fill(circ(x, 25, 1), P.blue.hi, ' opacity=".8"')).join(''),
    }),
    cel(rrect(28.5, 15.5, 15.5, 20, 7.5), P.blue, [36, 25.5, 9], {
      detail: fill(rrect(33.5, 19.5, 7.5, 6.5, 3), P.cyan.ink) + fill(rrect(34.5, 20.5, 5.5, 4.5, 2.2), P.cyan.base) + fill(circ(35.8, 21.8, 0.9), '#fff'),
    }),
    fill(circ(41.5, 31, 1.3), P.pink.base),
  ].join('');

const smelter = () =>
  [
    cel(rrect(29, 6, 7.5, 12, 2), P.steel, [32.75, 12, 5], { hl: 0, ink: 1.8 }),
    fill(circ(35, 4.2, 2.6), '#e8ecff', ' opacity=".55"'),
    fill(circ(39.5, 2.6, 2), '#e8ecff', ' opacity=".4"'),
    cel(rrect(11, 39, 7, 6, 1.5), P.steel, [14.5, 42, 3.5], { hl: 0, ink: 1.6 }),
    cel(rrect(30, 39, 7, 6, 1.5), P.steel, [33.5, 42, 3.5], { hl: 0, ink: 1.6 }),
    cel(rrect(7, 13, 34, 29, 9), P.orange, [24, 27.5, 15], {
      hl: 0.3,
      hlOp: 0.4,
      detail:
        line('M10 19.5h28', P.orange.lo, 1.4) +
        [12, 36].map((x) => fill(circ(x, 16.5, 1), P.orange.hi)).join('') +
        fill(rrect(13.5, 22, 21, 14.5, 5), P.orange.ink) +
        glow(24, 29.5, 11, '#ffb547', 0.55) +
        fill(rrect(15.5, 24, 17, 10.5, 3.5), '#ffb547') +
        fill(rrect(17.5, 25.5, 13, 6.5, 3), '#ffe9a8') +
        line('M20 24v10.5M24 24v10.5M28 24v10.5', P.orange.lo, 1.6),
    }),
  ].join('');

const fabricator = () =>
  [
    cel(ngon(24, 25.5, 17.5, 6), P.purple, [24, 25.5, 16], {
      detail:
        fill(circ(24, 27, 9.5), P.purple.ink) +
        fill(circ(24, 27, 8), '#3a1f6e') +
        fill(ell(24, 32.5, 6, 1.6), P.teal.base, ' opacity=".35"') +
        fill(poly(24, 22, 29.5, 25, 24, 28, 18.5, 25), P.teal.hi) +
        fill(poly(18.5, 25, 24, 28, 24, 34, 18.5, 31), P.teal.base) +
        fill(poly(24, 28, 29.5, 25, 29.5, 31, 24, 34), P.teal.lo) +
        line('M24 22L29.5 25V31L24 34L18.5 31V25ZM24 28V34M18.5 25L24 28L29.5 25', P.teal.ink, 1.1) +
        fill(circ(12.5, 19, 1.4), P.gold.base) +
        fill(circ(35.5, 19, 1.4), P.teal.base) +
        fill(circ(12.5, 32, 1.4), P.pink.base),
    }),
    line('M24 18.5V22', P.teal.base, 1.4, ' stroke-dasharray="1 1.2" opacity=".9"'),
    tube('M24 3V14', P.steel, 2.6),
    cel(poly(20, 13, 28, 13, 26, 18.5, 22, 18.5), P.steel, [24, 15.5, 4], { hl: 0, ink: 1.6 }),
  ].join('');

const dock = () => {
  const arch = 'M6 30A18 18 0 0 1 42 30';
  return [
    line(arch, P.gold.ink, 9.5),
    line(arch, P.gold.lo, 7),
    line('M7.6 27A16.6 16.6 0 0 1 40.4 27', P.gold.base, 4.6),
    line('M9.5 21A16 16 0 0 1 24 12.6', P.gold.hi, 1.6, ' opacity=".8"'),
    [[12.2, 17.7], [24, 12.3], [35.8, 17.7]].map(([x, y]) => fill(circ(x, y, 1.4), P.pink.base)).join(''),
    cel(rrect(2.5, 28, 11, 8, 2.2), P.steel, [8, 32, 5], { hl: 0, ink: 1.8 }),
    cel(rrect(34.5, 28, 11, 8, 2.2), P.steel, [40, 32, 5], { hl: 0, ink: 1.8 }),
    line('M13.5 32H18M30 32h4.5', P.steel.ink, 1.6),
    cel(ell(24, 31, 7.5, 4.6), P.steel, [24, 31, 6], {
      detail: fill(ell(26.5, 30, 2.6, 1.8), P.cyan.ink) + fill(ell(26.5, 30, 1.7, 1.1), P.cyan.base),
    }),
    glow(15.5, 31, 3.5, P.cyan.base, 0.6),
    cel(rrect(14, 38, 20, 6, 2.5), P.steel, [24, 41, 8], { hl: 0, ink: 1.8, detail: line('M18 41h12', P.steel.lo, 1.2, ' stroke-dasharray="2 2"') }),
  ].join('');
};

const laser = () =>
  [
    line('M38 15L44.5 8.5', P.red.base, 6, ' opacity=".35"'),
    line('M38 15L44.5 8.5', P.red.hi, 3, ' opacity=".7"'),
    line('M38 15L44.5 8.5', '#fff', 1.4),
    cel(rrect(8, 35, 27, 9, 3), P.steel, [21.5, 39.5, 9], { hl: 0, ink: 1.8, detail: line('M12 39.5h19', P.steel.lo, 1.2, ' stroke-dasharray="2.5 2"') }),
    tube('M25 27L36.5 15.5', P.steel, 5.2),
    line('M33.5 18.5L36.5 15.5', P.red.base, 5.2),
    line('M33.5 18.5L36.5 15.5', P.red.hi, 1.4, ' transform="translate(-.7 -.7)"'),
    glow(38, 14, 5, P.red.base, 0.7),
    glint(38, 14, 3.2),
    cel('M10 35A11.5 11.5 0 0 1 33 35Z', P.red, [21.5, 30, 10], {
      detail: fill(circ(21.5, 30.5, 3.4), P.red.ink) + fill(circ(21.5, 30.5, 2.1), '#ffb3ba') + fill(circ(20.8, 29.8, 0.8), '#fff'),
    }),
  ].join('');

const gravity = () =>
  [
    fill(circ(24, 24, 21), P.cyan.base, ' opacity=".12"'),
    `<g transform="rotate(-22 24 24)">`,
    line('M4.5 24A19.5 6.5 0 0 1 43.5 24', P.cyan.ink, 5),
    line('M4.5 24A19.5 6.5 0 0 1 43.5 24', P.cyan.lo, 2.6),
    `</g>`,
    glow(24, 24, 15, P.cyan.base, 0.5),
    cel(circ(24, 24, 10.5), P.dark, [24, 24, 10.5], {
      hl: 0.35,
      hlOp: 0.35,
      detail: line('M15.5 20A9.5 9.5 0 0 1 22 14.6', P.cyan.hi, 1.6, ' opacity=".9"') + fill(circ(24, 24, 4.4), '#03050f'),
    }),
    `<g transform="rotate(-22 24 24)">`,
    line('M4.5 24A19.5 6.5 0 0 0 43.5 24', P.cyan.ink, 5),
    line('M4.5 24A19.5 6.5 0 0 0 43.5 24', P.cyan.base, 2.8),
    line('M9 27.6A19.5 6.5 0 0 0 22 30.4', P.cyan.hi, 1.2),
    `</g>`,
    cel(ngon(39, 10, 3.2, 5, -20), P.rock, [39, 10, 3.2], { hl: 0, ink: 1.5 }),
    cel(ngon(8, 37, 2.4, 5, 10), P.rock, [8, 37, 2.4], { hl: 0, ink: 1.4 }),
  ].join('');

const nanite = () => {
  const cells: [number, number][] = [[16.5, 18], [31.5, 18], [24, 31]];
  return [
    ...cells.map(([x, y]) =>
      cel(ngon(x, y, 8.6, 6), P.green, [x, y, 8], {
        hl: 0.42,
        detail: fill(ngon(x, y, 4, 6), P.green.ink) + fill(circ(x, y, 2.3), '#d9ffc2') + fill(circ(x - 0.7, y - 0.7, 0.8), '#fff'),
      }),
    ),
    line('M22.6 18H25.4M20 24.6L21.3 26.6M28 24.6L26.7 26.6', P.green.base, 1.4, ' opacity=".9"'),
    ...[[7, 33, 2.2], [40, 31, 2], [38, 40, 1.4], [9, 9, 1.5], [41, 7.5, 1.7], [24, 6, 1.3], [12, 43, 1.3]].map(([x, y, r]) =>
      fill(circ(x, y, r + 1), P.green.ink) + fill(circ(x, y, r), P.green.base) + fill(circ(x - r * 0.3, y - r * 0.3, r * 0.4), '#fff'),
    ),
  ].join('');
};

const gate = () =>
  [
    fill(circ(24, 24, 14.5), '#24186e'),
    glow(24, 24, 12, P.violet.base, 0.5),
    line('M24 24m-1 -7a8 8 0 1 1 -7 9M24 24m1 7a8 8 0 1 1 7 -9', P.violet.hi, 1.8, ' opacity=".85"'),
    line('M24 24m-.5 -3.6a3.8 3.8 0 1 1 -3.4 4.4', '#fff', 1.4, ' opacity=".8"'),
    fill(circ(24, 24, 2.2), '#fff'),
    line(circ(24, 24, 16.5), P.violet.ink, 9.5),
    line(circ(24, 24, 16.5), P.violet.lo, 7),
    line('M10.2 33A16.5 16.5 0 0 1 33 10.2', P.violet.base, 5.4, ' transform="translate(-.6 -.6)"'),
    line('M10.5 20A15 15 0 0 1 20 10.5', P.violet.hi, 1.6, ' opacity=".85"'),
    ...[[24, 7.5], [40.5, 24], [24, 40.5], [7.5, 24]].map(([x, y]) =>
      cel(rrect(x - 3.6, y - 3.6, 7.2, 7.2, 1.6), P.steel, [x, y, 3.6], { hl: 0, ink: 1.6, detail: fill(circ(x, y, 1.2), P.teal.base) }),
    ),
  ].join('');

const dyson = () => {
  const panels = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = -90 + i * 60;
    const rad = (a * Math.PI) / 180;
    const x = 24 + Math.cos(rad) * 16.5;
    const y = 24 + Math.sin(rad) * 16.5;
    return (
      `<g transform="translate(${n(x)} ${n(y)}) rotate(${a + 90})">` +
      cel(rrect(-5.5, -3.8, 11, 7.6, 1.4), P.gold, [0, 0, 4.5], {
        hl: 0,
        ink: 1.6,
        detail: fill(rrect(-4, -2.4, 8, 4.8, 0.8), '#22306e') + line('M0 -2.4V2.4M-4 0H4', '#5a78d8', 0.7),
      }) +
      `</g>`
    );
  });
  return [
    line(circ(24, 24, 16.5), P.sun.lo, 1.2, ' stroke-dasharray="2 2.5" opacity=".7"'),
    glow(24, 24, 12, '#ffb547', 0.4),
    fill(circ(24, 24, 8.5), P.sun.lo),
    fill(circ(23.2, 23.2, 7.4), P.sun.base),
    fill(circ(22.4, 22.4, 4.6), P.sun.hi),
    fill(circ(21.6, 21.6, 1.8), '#fff'),
    outline(circ(24, 24, 8.5), P.sun.ink, 1.6),
    ...panels,
  ].join('');
};

const RAW_GEN_ICONS: Record<GeneratorId, string> = {
  drone: svg(drone()),
  hauler: svg(hauler()),
  smelter: svg(smelter()),
  fabricator: svg(fabricator()),
  dock: svg(dock()),
  laser: svg(laser()),
  gravity: svg(gravity()),
  nanite: svg(nanite()),
  gate: svg(gate()),
  dyson: svg(dyson()),
};

// ---------------------------------------------------------------- currencies and pickups

const SCRAP_GEAR =
  'M24 3 l4.2 6.3 7.4-1.7 1 7.5 7 2.9-3 6.9 4.6 6-6.4 4-0.3 7.6-7.4-1.1-4.7 5.9-4.6-6-7.4 1.3-0.4-7.6-6.5-3.9 4.5-6.1-3-6.8 7-3 0.9-7.5 7.4 1.6z';

const scrap = () =>
  cel(SCRAP_GEAR, P.gold, [24, 24, 19], {
    hl: 0.45,
    detail: fill(circ(24, 24, 8), P.gold.lo) + fill(circ(24, 24, 6.4), '#3a2405') + fill(circ(25, 25, 3.4), '#5a3a0a') + line('M18.5 19.5A7.5 7.5 0 0 1 22 17', P.gold.hi, 1.4),
  }) + glint(13, 12, 2.6);

const crystal = () => {
  const ramp = P.ice;
  return [
    fill(poly(16, 5, 32, 5, 41, 17, 24, 44, 7, 17), ramp.lo),
    fill(poly(16, 5, 32, 5, 28, 17, 20, 17), ramp.hi),
    fill(poly(16, 5, 20, 17, 7, 17), '#b8eeff'),
    fill(poly(32, 5, 41, 17, 28, 17), ramp.base),
    fill(poly(7, 17, 20, 17, 24, 44), ramp.base),
    fill(poly(20, 17, 28, 17, 24, 44), '#a8e9ff'),
    fill(poly(28, 17, 41, 17, 24, 44), ramp.lo),
    line('M7 17H41M16 5L20 17L24 44L28 17L32 5', '#fff', 1, ' opacity=".55"'),
    outline(poly(16, 5, 32, 5, 41, 17, 24, 44, 7, 17), ramp.ink),
    glint(14, 10, 3.2),
  ].join('');
};

const star = () => fill(circ(24, 25, 19), P.gold.base, ' opacity=".14"') + facetStar(24, 25.5, 21, 9, 5, P.gold) + glint(17, 17, 2.4);

const core = () =>
  glow(24, 24, 21, P.violet.base, 0.45) + facetStar(24, 24, 20, 6.5, 4, P.violet) + fill(circ(24, 24, 5.2), P.violet.hi) + fill(circ(24, 24, 3.4), '#fff') + glint(36, 13, 2.2, '#fff', 0.9);

const claw = () =>
  [
    tube('M24 44V27', P.steel, 5),
    tube('M21.5 23L12 13L16.5 6M26.5 23L36 13L31.5 6', P.gold, 3.8),
    cel(circ(24, 24.5, 5.5), P.steel, [24, 24.5, 5.5], { detail: fill(circ(24, 24.5, 2), P.steel.ink) }),
  ].join('');

const meteor = () =>
  [
    line('M5 5L25 23', P.orange.base, 8, ' opacity=".35"'),
    line('M8 5L26 21', '#ffb547', 4.5, ' opacity=".7"'),
    line('M11 6L26 19', '#fff1c4', 1.8),
    cel(ngon(31, 30, 12, 7, -10), P.rock, [31, 30, 11.5], {
      detail: fill(circ(27, 27, 2.8), P.rock.lo) + fill(circ(35.5, 33.5, 2.2), P.rock.lo) + fill(circ(33, 25, 1.4), P.rock.lo) + line('M24 31A8 8 0 0 1 27 24', '#ffb547', 1.6, ' opacity=".8"'),
    }),
  ].join('');

const flare = () =>
  [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = (i * 45 * Math.PI) / 180;
      const r1 = 13;
      const r2 = i % 2 ? 19 : 21.5;
      return line(`M${n(24 + Math.cos(a) * r1)} ${n(24 + Math.sin(a) * r1)}L${n(24 + Math.cos(a) * r2)} ${n(24 + Math.sin(a) * r2)}`, P.orange.base, 3.4);
    }),
    glow(24, 24, 14, '#ffb547', 0.6),
    cel(circ(24, 24, 10), P.gold, [24, 24, 10], { hl: 0.5, hlOp: 0.8 }),
    glint(20.5, 20.5, 2.4),
  ].join('');

// ---------------------------------------------------------------- glyphs

/** A plain glyph: one `color` attribute drives every part, so CSS or `.replace` can tint it. */
const glyph = (body: string) => svg(`<g color="currentColor">${body}</g>`);
const cf = (d: string, op = 1) => `<path d="${d}" fill="currentColor"${op < 1 ? ` opacity="${op}"` : ''}/>`;
const cs = (d: string, w: number, op = 1) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
/** Punches a dark detail into a glyph (works on any tint because it is a translucent shade). */
const cut = (d: string, op = 0.45) => `<path d="${d}" fill="#0b0e2a" opacity="${op}"/>`;

const RAW_ICONS = {
  scrap: svg(scrap()),
  crystal: svg(crystal()),
  star: svg(star()),
  core: svg(core()),
  claw: svg(claw()),
  meteor: svg(meteor()),
  flare: svg(flare()),
  bolt: glyph(
    cf('M28 3L9.5 27.5H21.5L18 45L38.5 19.5H26.5Z') +
      `<path d="M26 8L14 24.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>` +
      `<path d="M28 3L9.5 27.5H21.5L18 45L38.5 19.5H26.5Z" fill="none" stroke="#0b0e2a" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>`,
  ),
  build: glyph(
    cf('M31 5a11 11 0 0 0-10.3 14.6L6.5 33.8a4 4 0 0 0 5.7 5.7l14.2-14.2A11 11 0 0 0 41.2 13l-6.6 2.2-3.3-3.3L33.5 5.3A11 11 0 0 0 31 5z') +
      cut(circ(9.6, 36.6, 1.8), 0.5) +
      cs('M33 34l7 7', 4.5, 0.5) +
      cf(rrect(26, 26, 8, 8, 2), 0.5),
  ),
  upgrades: glyph(cf(rrect(6, 6, 36, 36, 10), 0.35) + cs('M15 25L24 16L33 25M15 34L24 25L33 34', 4.5)),
  station: glyph(
    cs(circ(24, 24, 15.5), 3.4, 0.55) +
      cf(circ(24, 24, 9)) +
      cut(circ(24, 24, 3.6)) +
      cf(rrect(1.5, 19.5, 9, 9, 2)) +
      cf(rrect(37.5, 19.5, 9, 9, 2)) +
      cf(rrect(22, 3, 4, 7, 1.5), 0.8),
  ),
  soundOn: glyph(cf('M7 18h8l10-8.5v29L15 30H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z') + cs('M31.5 17.5a9 9 0 0 1 0 13', 3.4) + cs('M36 12a16 16 0 0 1 0 24', 3.4, 0.55)),
  soundOff: glyph(cf('M7 18h8l10-8.5v29L15 30H7a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z') + cs('M32 18.5l10 11M42 18.5l-10 11', 3.6)),
  trophy: glyph(
    cs('M14.5 10H7.5a7.5 7.5 0 0 0 8.5 9.5M33.5 10h7a7.5 7.5 0 0 1-8.5 9.5', 3.4, 0.6) +
      cf('M13.5 5h21v11.5a10.5 10.5 0 0 1-21 0z') +
      cs('M18.5 9.5v7a5.5 5.5 0 0 0 2.5 4.6', 2.2, 0.3) +
      cf(rrect(21, 26, 6, 7, 1)) +
      cf(rrect(13, 33, 22, 8, 2.5)) +
      cut(rrect(18, 35.5, 12, 3, 1.5), 0.35),
  ),
  warp: glyph(cs(circ(24, 24, 17), 4) + cs('M24 13a11 11 0 1 1-10.4 14.6', 3.2, 0.6) + cs('M24 19a5 5 0 1 1-4.8 6.4', 2.6, 0.8) + cf(circ(24, 24, 2.2))),
  missions: glyph(
    cf(rrect(9, 7, 30, 37, 5)) +
      cf(rrect(17, 3, 14, 8, 3)) +
      cut(rrect(20.5, 5.5, 7, 3, 1.5), 0.5) +
      `<path d="M15.5 21l3 3 6-6M15.5 33l3 3 6-6" fill="none" stroke="#0b0e2a" stroke-opacity=".75" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
      cut(rrect(28, 19.5, 6.5, 3, 1.5), 0.6) +
      cut(rrect(28, 31.5, 6.5, 3, 1.5), 0.6),
  ),
  crew: glyph(
    cf(circ(33, 15.5, 6), 0.5) +
      cf('M26 28.5c2-1.3 4.5-2 7-2 6.5 0 10.5 4.5 10.5 11.5a2 2 0 0 1-2 2H31z', 0.5) +
      cf(circ(18, 15, 7.5)) +
      cf('M4 40c0-9.5 6-15 14-15s14 5.5 14 15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'),
  ),
  lab: glyph(
    cs('M18.5 5h11M21 5v13L9 38.5a3.5 3.5 0 0 0 3 5.5h24a3.5 3.5 0 0 0 3-5.5L27 18V5', 3.4) +
      cf('M14.5 30h19l5 8.5a3.5 3.5 0 0 1-3 5.5H12.5a3.5 3.5 0 0 1-3-5.5z', 0.85) +
      cf(circ(21, 24.5, 2.2), 0.7) +
      cf(circ(27.5, 20.5, 1.6), 0.5) +
      cut(circ(19, 37, 1.6), 0.35) +
      cut(circ(28, 35, 2.2), 0.35),
  ),
  check: glyph(cs('M10 25l9 9 19-20', 5.5)),
  clock: glyph(cf(circ(24, 25, 19), 0.3) + cs(circ(24, 25, 17), 4) + cs('M24 14v11.5l7.5 4.5', 4) + cf(rrect(20, 2, 8, 5, 2))),
  palette: glyph(
    cf('M24 5C13 5 5 13 5 23c0 9 7 15 14 15 3 0 3.4-3 2-5.4-1.4-2.4 0-4.6 3-4.6h6c7.4 0 13-4 13-11C43 10 34 5 24 5z') +
      '<circle cx="14.5" cy="20.5" r="3.2" fill="#ff6b9a"/><circle cx="21.5" cy="13" r="3.2" fill="#ffd166"/><circle cx="31" cy="13.5" r="3.2" fill="#4fe3c1"/><circle cx="35.5" cy="22" r="3.2" fill="#7aa7ff"/>',
  ),
  gear: glyph(
    cf(
      'M41.7 17.2 L43.0 23.5 L38.5 22.9 L36.9 30.5 L41.4 31.7 L37.8 37.1 L35.0 33.4 L28.5 37.8 L30.8 41.7 L24.5 43.0 L25.1 38.5 L17.5 36.9 L16.3 41.4 L10.9 37.8 L14.6 35.0 L10.2 28.5 L6.3 30.8 L5.0 24.5 L9.5 25.1 L11.1 17.5 L6.6 16.3 L10.2 10.9 L13.0 14.6 L19.5 10.2 L17.2 6.3 L23.5 5.0 L22.9 9.5 L30.5 11.1 L31.7 6.6 L37.1 10.2 L33.4 13.0 L37.8 19.5 Z',
    ) +
      cut(circ(24, 24, 7.5), 0.75) +
      cf(circ(24, 24, 3)),
  ),
  lock: glyph(cs('M16 21v-5a8 8 0 0 1 16 0v5', 4.2, 0.6) + cf(rrect(10, 20, 28, 22, 5)) + cut(circ(24, 29.5, 3), 0.55) + cut(rrect(22.5, 30, 3, 6.5, 1.5), 0.55)),
};

/**
 * Icons that still use gradients (none in this set today) need unique ids per copy: a gradient
 * defined in a hidden copy doesn't render. Every read hands out a copy with its own ids.
 */
let uid = 0;
function uniqueIds(svgText: string): string {
  if (!svgText.includes('id="')) return svgText;
  const k = ++uid;
  return svgText.replace(/id="([^"]+)"/g, `id="$1-${k}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${k})`);
}

function fresh<T extends Record<string, string>>(raw: T): T {
  return new Proxy(raw, { get: (t, k) => (typeof k === 'string' && k in t ? uniqueIds(t[k as keyof T]) : undefined) });
}

export const GEN_ICONS = fresh(RAW_GEN_ICONS);
export const ICONS = fresh(RAW_ICONS);
