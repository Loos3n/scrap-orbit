import type { GeneratorId } from '../core/config';

/** Inline SVG icons, drawn on a 48x48 grid. Colours come from CSS (currentColor) where it matters. */
const svg = (body: string, view = 48) =>
  `<svg viewBox="0 0 ${view} ${view}" aria-hidden="true" focusable="false">${body}</svg>`;

export const GEN_ICONS: Record<GeneratorId, string> = {
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
};

export const ICONS = {
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
  lock: svg(`<rect x="11" y="21" width="26" height="20" rx="4" fill="currentColor"/><path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" stroke="currentColor" stroke-width="4"/>`),
};
