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

/**
 * Formats a number for display: 999, 1.23K, 45.6M, ... then aa, ab, ...
 * Values under 100 keep one decimal when they have a fraction.
 */
export function format(value: Decimal | number, scientific = false): string {
  const v = value instanceof Decimal ? value : D(value);
  if (v.lt(0)) return '-' + format(v.neg(), scientific);
  if (v.lt(1000)) {
    const n = v.toNumber();
    if (n < 100 && n % 1 !== 0) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return Math.floor(n).toString();
  }
  if (scientific) return `${v.m.toFixed(2)}e${v.e}`;
  const group = Math.floor(v.e / 3);
  const mantissa = v.m * Math.pow(10, v.e - group * 3);
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
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
