import Decimal from 'break_infinity.js';

export { Decimal };
export type Num = Decimal;

export const D = (v: number | string | Decimal): Decimal => new Decimal(v);
export const ZERO = D(0);

const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Letter suffix for groups past the named ones: aa, ab, ... az, ba, ... */
function letterSuffix(index: number): string {
  const a = 'a'.charCodeAt(0);
  const first = Math.floor(index / 26);
  const second = index % 26;
  return String.fromCharCode(a + first) + String.fromCharCode(a + second);
}

export type NumberStyle = 'letters' | 'scientific' | 'engineering';

/**
 * Formats a number for display: 999, 1.23K, 45.6M, ... then aa, ab, ...
 * Scientific gives 1.23e6; engineering keeps exponents to multiples of 3 (12.3e6).
 * Values under 100 keep one decimal when they have a fraction.
 */
export function format(value: Decimal | number, style: NumberStyle | boolean = 'letters'): string {
  if (typeof style === 'boolean') style = style ? 'scientific' : 'letters';
  const v = value instanceof Decimal ? value : D(value);
  if (v.lt(0)) return '-' + format(v.neg(), style);
  if (v.lt(1000)) {
    const n = v.toNumber();
    if (n < 100 && n % 1 !== 0) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return Math.floor(n).toString();
  }
  if (style === 'scientific') return `${(Math.floor(v.m * 100 + 1e-9) / 100).toFixed(2)}e${v.e}`;
  if (style === 'engineering') {
    const e3 = Math.floor(v.e / 3) * 3;
    const m = v.m * Math.pow(10, v.e - e3);
    const d = m >= 100 ? 0 : m >= 10 ? 1 : 2;
    return `${(Math.floor(m * 10 ** d + 1e-9) / 10 ** d).toFixed(d)}e${e3}`;
  }
  const group = Math.floor(v.e / 3);
  const mantissa = v.m * Math.pow(10, v.e - group * 3);
  // Past "zz" the letters run out, so very large numbers fall back to scientific.
  if (group - SHORT.length >= 26 * 26) return format(v, 'scientific');
  const suffix = group < SHORT.length ? SHORT[group] : letterSuffix(group - SHORT.length);
  const digits = mantissa >= 100 ? 0 : mantissa >= 10 ? 1 : 2;
  const factor = Math.pow(10, digits);
  return (Math.floor(mantissa * factor + 1e-9) / factor).toFixed(digits) + suffix;
}

/** Formats a duration in seconds as "45s", "3m 20s", "2h 5m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}
