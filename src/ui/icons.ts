import type { GeneratorId } from '../core/config';

/** Inline SVG icons, drawn on a 48x48 grid. Colours come from CSS (currentColor) where it matters. */
const svg = (body: string, view = 48) =>
  `<svg viewBox="0 0 ${view} ${view}" aria-hidden="true" focusable="false">${body}</svg>`;

const RAW_GEN_ICONS: Record<GeneratorId, string> = {
  drone: svg(`
    <defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9fff3"/><stop offset="1" stop-color="#1fa587"/></linearGradient></defs>
    <path d="M24 8 L38 34 L24 28 L10 34 Z" fill="url(#gd)" stroke="#0b2b2a" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse cx="24" cy="21" rx="3.6" ry="5" fill="#0b2b2a"/><ellipse cx="23" cy="19" rx="1.2" ry="1.8" fill="#fff" opacity=".85"/>
    <path d="M18 35 Q24 44 30 35" fill="none" stroke="#4fe3c1" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`),
  hauler: svg(`
    <defs><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3edff"/><stop offset="1" stop-color="#3557b8"/></linearGradient></defs>
    <rect x="6" y="15" width="30" height="18" rx="4" fill="url(#gh)" stroke="#16245a" stroke-width="1.5"/>
    <path d="M36 16 Q45 24 36 32 Z" fill="url(#gh)" stroke="#16245a" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="10" y="19" width="6" height="10" rx="1" fill="#ff8a4c"/><rect x="18" y="19" width="6" height="10" rx="1" fill="#ffd166"/><rect x="26" y="19" width="6" height="10" rx="1" fill="#4fe3c1"/>
    <rect x="2" y="19" width="4" height="10" rx="1" fill="#2b3170"/>`),
  smelter: svg(`
    <defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd8bd"/><stop offset="1" stop-color="#7a3014"/></linearGradient>
    <radialGradient id="gsf"><stop offset="0" stop-color="#fff4c2"/><stop offset=".6" stop-color="#ffb547"/><stop offset="1" stop-color="#ff5a1f"/></radialGradient></defs>
    <rect x="8" y="10" width="32" height="30" rx="8" fill="url(#gs)" stroke="#4a1a0a" stroke-width="1.5"/>
    <rect x="14" y="18" width="20" height="14" rx="3" fill="url(#gsf)"/>
    <path d="M19 18v14M24 18v14M29 18v14" stroke="#7a2a10" stroke-width="1.6" opacity=".7"/>
    <path d="M20 9 Q22 4 20 1 M28 9 Q30 5 28 2" stroke="#ffb547" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>`),
  fabricator: svg(`
    <defs><linearGradient id="gf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1e1ff"/><stop offset="1" stop-color="#5a2fa0"/></linearGradient></defs>
    <path d="M24 5 L40 14.5 L40 33.5 L24 43 L8 33.5 L8 14.5 Z" fill="url(#gf)" stroke="#2a1250" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="8" fill="#241245"/><circle cx="24" cy="24" r="3.5" fill="#f2e3ff"/>
    <circle cx="14" cy="17" r="1.6" fill="#4fe3c1"/><circle cx="34" cy="17" r="1.6" fill="#ffd166"/>`),
  dock: svg(`
    <defs><linearGradient id="gk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset="1" stop-color="#b07a12"/></linearGradient></defs>
    <path d="M6 30 A20 20 0 0 1 42 30" fill="none" stroke="url(#gk)" stroke-width="4" stroke-linecap="round"/>
    <path d="M10 33 A16 16 0 0 1 38 33" fill="none" stroke="url(#gk)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M12 22 L16 30 M18 17 L21 27 M26 15 L26 26 M33 18 L30 27 M37 23 L33 30" stroke="#ffd166" stroke-width="1.6" opacity=".9"/>
    <rect x="19" y="34" width="10" height="8" rx="2" fill="url(#gk)" stroke="#6a4808" stroke-width="1.2"/>
    <circle cx="24" cy="38" r="1.5" fill="#ff6b9a"/>`),
  laser: svg(`
    <defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd0d4"/><stop offset="1" stop-color="#8a1e2a"/></linearGradient></defs>
    <path d="M27 21 L45 7" stroke="#ff5d6c" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    <path d="M27 21 L45 7" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="9" y="30" width="22" height="12" rx="3" fill="#2b3170" stroke="#151845" stroke-width="1.5"/>
    <circle cx="20" cy="29" r="9" fill="url(#gl)" stroke="#4a0e16" stroke-width="1.5"/>
    <path d="M22 26 L32 18" stroke="url(#gl)" stroke-width="6" stroke-linecap="round"/>
    <circle cx="33" cy="17.5" r="2.4" fill="#fff"/>`),
  gravity: svg(`
    <defs><radialGradient id="gg"><stop offset="0" stop-color="#05061a"/><stop offset=".45" stop-color="#0d2a4a"/><stop offset=".75" stop-color="#5ce1ff"/><stop offset="1" stop-color="#5ce1ff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="24" cy="24" r="20" fill="url(#gg)"/>
    <path d="M24 8 C36 8 40 20 32 26 M24 40 C12 40 8 28 16 22 M8 24 C8 13 19 9 25 16 M40 24 C40 35 29 39 23 32" fill="none" stroke="#c8f6ff" stroke-width="2" stroke-linecap="round" opacity=".85"/>
    <circle cx="24" cy="24" r="5" fill="#000"/>`),
  nanite: svg(`
    <g fill="#9dff6b">
      <circle cx="24" cy="24" r="4"/><circle cx="14" cy="18" r="2.6"/><circle cx="33" cy="16" r="2.2"/><circle cx="35" cy="30" r="3"/>
      <circle cx="16" cy="33" r="2.4"/><circle cx="25" cy="37" r="1.8"/><circle cx="9" cy="25" r="1.6"/><circle cx="40" cy="22" r="1.5"/>
      <circle cx="24" cy="10" r="1.8"/><circle cx="30" cy="42" r="1.3"/>
    </g>
    <g stroke="#9dff6b" stroke-width="1" opacity=".5"><path d="M24 24 L14 18 M24 24 L33 16 M24 24 L35 30 M24 24 L16 33 M24 24 L25 37"/></g>
    <circle cx="23" cy="23" r="1.4" fill="#fff"/>`),
  gate: svg(`
    <defs><radialGradient id="gw"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#c2b6ff"/><stop offset="1" stop-color="#3a2a9a"/></radialGradient>
    <linearGradient id="gwr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6e0ff"/><stop offset="1" stop-color="#4a3aa8"/></linearGradient></defs>
    <circle cx="24" cy="24" r="15" fill="url(#gw)"/>
    <circle cx="24" cy="24" r="17" fill="none" stroke="url(#gwr)" stroke-width="5"/>
    <g fill="#8f7bff" stroke="#241a6a" stroke-width="1"><rect x="21" y="3" width="6" height="6" rx="1"/><rect x="21" y="39" width="6" height="6" rx="1"/><rect x="3" y="21" width="6" height="6" rx="1"/><rect x="39" y="21" width="6" height="6" rx="1"/></g>`),
  dyson: svg(`
    <defs><radialGradient id="gy"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ff8a4c"/></radialGradient></defs>
    <circle cx="24" cy="24" r="9" fill="url(#gy)"/>
    <g fill="#ffd166" stroke="#7a5208" stroke-width="1">
      <path d="M24 5 l6 3 -2 5 -8 0 -2 -5z"/><path d="M41 18 l-1 7 -5 0 -2 -7 4 -3z"/><path d="M37 38 l-6 3 -3 -4 4 -6 5 1z"/>
      <path d="M11 38 l6 3 3 -4 -4 -6 -5 1z"/><path d="M7 18 l1 7 5 0 2 -7 -4 -3z"/>
    </g>`),
};

const RAW_ICONS = {
  scrap: svg(`
    <defs><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset=".5" stop-color="#ffb547"/><stop offset="1" stop-color="#c4701a"/></linearGradient></defs>
    <path d="M24 3 l4.2 6.3 7.4-1.7 1 7.5 7 2.9-3 6.9 4.6 6-6.4 4-0.3 7.6-7.4-1.1-4.7 5.9-4.6-6-7.4 1.3-0.4-7.6-6.5-3.9 4.5-6.1-3-6.8 7-3 0.9-7.5 7.4 1.6z" fill="url(#gb)" stroke="#7a4a08" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="7" fill="#2b1a05" opacity=".75"/><circle cx="22" cy="22" r="2" fill="#fff" opacity=".5"/>`),
  bolt: svg(`<path d="M27 3 L10 27 h11 l-3 18 L38 20 H26 Z" fill="currentColor" stroke="rgba(0,0,0,.25)" stroke-width="1.5" stroke-linejoin="round"/>`),
  build: svg(`<path d="M30 6a10 10 0 0 0-9.4 13.4L7 33a3.5 3.5 0 0 0 5 5l13.6-13.6A10 10 0 0 0 39 15l-6 2-3-3 2-6a10 10 0 0 0-2-2z" fill="currentColor"/>`),
  upgrades: svg(`<path d="M24 5 L28 15 L39 15 L30 22 L33.5 33 L24 26.5 L14.5 33 L18 22 L9 15 L20 15 Z" fill="currentColor"/><rect x="12" y="37" width="24" height="5" rx="2.5" fill="currentColor" opacity=".6"/>`),
  station: svg(`<circle cx="24" cy="24" r="9" fill="currentColor"/><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="8 4"/><rect x="2" y="22" width="8" height="4" rx="1" fill="currentColor"/><rect x="38" y="22" width="8" height="4" rx="1" fill="currentColor"/>`),
  soundOn: svg(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="currentColor"/><path d="M32 17a9 9 0 0 1 0 14M36 12a15 15 0 0 1 0 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  soundOff: svg(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="currentColor"/><path d="M32 18l10 12M42 18L32 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`),
  claw: svg(`
    <path d="M24 44V26" stroke="#c5cbff" stroke-width="6" stroke-linecap="round"/>
    <circle cx="24" cy="24" r="5" fill="#fff"/>
    <path d="M21 22 L11 12 L16 6 M27 22 L37 12 L32 6" fill="none" stroke="#e6e9ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
  star: svg(`
    <defs><radialGradient id="gst"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#ffd166"/><stop offset="1" stop-color="#ff6b9a"/></radialGradient></defs>
    <path d="M24 3 L29 18 L45 18 L32 28 L37 44 L24 34 L11 44 L16 28 L3 18 L19 18 Z" fill="url(#gst)" stroke="#7a3a50" stroke-width="1.5" stroke-linejoin="round"/>`),
  core: svg(`
    <defs><radialGradient id="ic" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#d9d0ff"/><stop offset="1" stop-color="#6a4cff"/></radialGradient></defs>
    <circle cx="24" cy="24" r="20" fill="#8f7bff" opacity=".18"/>
    <path d="M24 4 L28.5 19.5 L44 24 L28.5 28.5 L24 44 L19.5 28.5 L4 24 L19.5 19.5 Z" fill="url(#ic)"/>
    <circle cx="24" cy="24" r="6" fill="#fff"/>`),
  trophy: svg(`<path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="currentColor"/><path d="M14 9H7a7 7 0 0 0 7 9M34 9h7a7 7 0 0 1-7 9" fill="none" stroke="currentColor" stroke-width="3"/><rect x="21" y="25" width="6" height="8" fill="currentColor"/><rect x="14" y="33" width="20" height="6" rx="2" fill="currentColor"/>`),
  warp: svg(`<circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".6"/><circle cx="24" cy="24" r="3" fill="currentColor"/>`),
  crystal: svg(`
    <defs><linearGradient id="icr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6fbff"/><stop offset=".5" stop-color="#5cd6ff"/><stop offset="1" stop-color="#2a5fd0"/></linearGradient></defs>
    <path d="M24 4 L38 17 L24 44 L10 17 Z" fill="url(#icr)" stroke="#0b1a40" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M10 17 H38 M24 4 L18 17 L24 44 L30 17 Z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-linejoin="round"/>`),
  missions: svg(`<rect x="10" y="7" width="28" height="36" rx="4" fill="currentColor" opacity=".9"/><rect x="17" y="3" width="14" height="8" rx="2" fill="currentColor"/><path d="M16 20l3 3 6-6M16 32l3 3 6-6" fill="none" stroke="#141838" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="28" y="19" width="6" height="3" rx="1.5" fill="#141838"/><rect x="28" y="31" width="6" height="3" rx="1.5" fill="#141838"/>`),
  crew: svg(`<circle cx="18" cy="16" r="7" fill="currentColor"/><path d="M5 40c0-9 6-14 13-14s13 5 13 14z" fill="currentColor"/><circle cx="33" cy="18" r="5.5" fill="currentColor" opacity=".6"/><path d="M27 29c2-1 4-2 6-2 6 0 10 4 10 11h-11" fill="currentColor" opacity=".6"/>`),
  lab: svg(`<path d="M19 5h10M21 5v13L9 39a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4L27 18V5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M14 31h20l4 8H10z" fill="currentColor"/><circle cx="21" cy="25" r="2" fill="currentColor"/><circle cx="27" cy="21" r="1.5" fill="currentColor"/>`),
  meteor: svg(`<path d="M6 6 L26 22" stroke="#ffb547" stroke-width="5" stroke-linecap="round" opacity=".5"/><path d="M12 4 L28 18" stroke="#ff6b3d" stroke-width="3" stroke-linecap="round" opacity=".6"/><circle cx="31" cy="30" r="11" fill="#8a7a6a"/><circle cx="28" cy="27" r="3" fill="#6a5a4a"/><circle cx="35" cy="34" r="2" fill="#6a5a4a"/>`),
  flare: svg(`<circle cx="24" cy="24" r="10" fill="#ffd166"/><g stroke="#ff8a4c" stroke-width="3.5" stroke-linecap="round"><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l4 4M35 35l4 4M9 39l4-4M35 13l4-4"/></g>`),
  check: svg(`<path d="M10 25l9 9 19-20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  clock: svg(`<circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 13v12l8 5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`),
  palette: svg(`<path d="M24 5C13 5 5 13 5 23c0 9 7 15 14 15 3 0 3-3 2-5s0-5 3-5h6c7 0 13-4 13-11C43 10 34 5 24 5z" fill="currentColor"/><circle cx="15" cy="20" r="3" fill="#ff6b9a"/><circle cx="22" cy="13" r="3" fill="#ffd166"/><circle cx="31" cy="14" r="3" fill="#4fe3c1"/><circle cx="35" cy="22" r="3" fill="#7aa7ff"/>`),
  lock: svg(`<rect x="11" y="21" width="26" height="20" rx="4" fill="currentColor"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="currentColor" stroke-width="4"/>`),
};

/**
 * Icons with gradients carry ids, and a page can show the same icon many times, some copies
 * inside hidden tabs. A gradient defined in a hidden copy doesn't render, so every read hands
 * out a copy with its own ids.
 */
let uid = 0;
function uniqueIds(svgText: string): string {
  if (!svgText.includes('id="')) return svgText;
  const n = ++uid;
  return svgText.replace(/id="([^"]+)"/g, `id="$1-${n}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-${n})`);
}

function fresh<T extends Record<string, string>>(raw: T): T {
  return new Proxy(raw, { get: (t, k) => (typeof k === 'string' && k in t ? uniqueIds(t[k as keyof T]) : undefined) });
}

export const GEN_ICONS = fresh(RAW_GEN_ICONS);
export const ICONS = fresh(RAW_ICONS);
