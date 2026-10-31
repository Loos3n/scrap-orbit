import type { CrewDef } from '../core/content';

/**
 * Crew portraits, drawn as small SVG busts from a few traits (skin, hair, suit, style).
 * Plain fills only, no gradient ids, so any number of copies can sit on the page.
 * They follow the art set's house style (see icons.ts): dark ink outlines, light from the
 * upper left, and a translucent shade on the lower right of each form.
 */
export function portrait(def: CrewDef, locked = false): string {
  const { skin, hair, suit, visor, style } = def.look;
  const ink = '#141838';
  const k = locked ? '#2a2f5c' : null;
  const sk = k ?? skin;
  const hr = k ?? hair;
  const st = k ?? suit;
  const parts: string[] = [];
  const shade = `fill="#0b0e2a" opacity=".22"`;
  const line = `fill="none" stroke="${ink}" stroke-opacity=".85" stroke-width="1.8" stroke-linejoin="round"`;
  // Backdrop glow in the suit colour, with a soft ring.
  parts.push(`<circle cx="32" cy="32" r="31" fill="${locked ? '#0d1030' : suit}" opacity="${locked ? 1 : 0.22}"/>`);
  if (!locked) parts.push(`<circle cx="32" cy="32" r="27" fill="none" stroke="${suit}" stroke-opacity=".25" stroke-width="1.5"/>`);
  // Shoulders and suit collar.
  parts.push(`<path d="M8 64c0-13 10-20 24-20s24 7 24 20z" fill="${st}"/>`);
  parts.push(`<path d="M40 45.5c9 2.5 16 8.5 16 18.5H42c1-7 0-13-2-18.5z" ${shade}/>`);
  parts.push(`<path d="M11 58c2-6 6-10 12-12" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`);
  parts.push(`<path d="M8 64c0-13 10-20 24-20s24 7 24 20" ${line}/>`);
  parts.push(`<path d="M22 46l10 9 10-9" fill="none" stroke="${k ?? '#fff'}" stroke-opacity=".55" stroke-width="2.5" stroke-linejoin="round"/>`);
  parts.push(`<rect x="27" y="38" width="10" height="8" rx="3" fill="${sk}"/>`);
  parts.push(`<rect x="27" y="38" width="10" height="4.5" rx="2" ${shade}/>`);
  if (style === 'bun') parts.push(`<circle cx="32" cy="10" r="7" fill="${hr}"/>`);
  if (style === 'bob') parts.push(`<path d="M15 30c0-12 7-19 17-19s17 7 17 19v8h-6V27H21v11h-6z" fill="${hr}"/>`);
  // Head.
  parts.push(`<ellipse cx="32" cy="28" rx="12" ry="13" fill="${sk}"/>`);
  parts.push(`<path d="M41.5 20a12 13 0 0 1-9.5 21 12 13 0 0 0 9.5-21z" ${shade}/>`);
  parts.push(`<ellipse cx="32" cy="28" rx="12" ry="13" ${line}/>`);
  if (style === 'helmet') {
    parts.push(`<circle cx="32" cy="28" r="18" fill="none" stroke="${k ?? '#dfe4ff'}" stroke-width="3.5"/>`);
    parts.push(`<path d="M19 18a18 18 0 0 1 12-7" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>`);
    parts.push(`<rect x="13" y="25" width="4" height="8" rx="2" fill="${st}"/><rect x="47" y="25" width="4" height="8" rx="2" fill="${st}"/>`);
  }
  if (style === 'buzz') parts.push(`<path d="M20 24c0-8 5-12 12-12s12 4 12 12c-3-3-7-4-12-4s-9 1-12 4z" fill="${hr}"/>`);
  if (style === 'bun' || style === 'bob') parts.push(`<path d="M20 26c0-9 5-14 12-14s12 5 12 14c-4-5-8-7-12-7s-8 2-12 7z" fill="${hr}"/>`);
  if (style === 'spiky') parts.push(`<path d="M19 26l-1-9 5 3 2-8 4 6 4-7 3 7 5-4-1 8 4 1-3 4c-4-4-8-5-12-5s-8 1-10 4z" fill="${hr}"/>`);
  if (!locked) {
    // Face.
    parts.push(`<circle cx="27" cy="29" r="1.8" fill="${ink}"/><circle cx="37" cy="29" r="1.8" fill="${ink}"/>`);
    parts.push(`<circle cx="27.6" cy="28.4" r=".6" fill="#fff"/><circle cx="37.6" cy="28.4" r=".6" fill="#fff"/>`);
    parts.push(`<path d="M28 34q4 3 8 0" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`);
    parts.push(`<circle cx="24" cy="33" r="2" fill="#ff7a8a" opacity=".35"/><circle cx="40" cy="33" r="2" fill="#ff7a8a" opacity=".35"/>`);
    // Headset mic in their suit's accent colour.
    parts.push(`<path d="M20 30v4q0 4 6 5" fill="none" stroke="${visor}" stroke-width="1.6" stroke-linecap="round"/><circle cx="26.5" cy="39" r="1.4" fill="${visor}"/>`);
  } else {
    parts.push(`<text x="32" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#5a6098" font-family="Fredoka, sans-serif">?</text>`);
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}
