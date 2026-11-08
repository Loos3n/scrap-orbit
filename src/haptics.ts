import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Vibration. The game describes a buzz the way the web does: a length in milliseconds, or a
 * pattern of on, off, on... lengths. In the phone app those become the phone's own crisp taps
 * (light for small things, heavy for big ones, a "success" ripple for the biggest), which feel
 * far better than the plain motor buzz browsers get. Browsers keep using navigator.vibrate.
 */

const native = () => Capacitor.isNativePlatform();

function styleFor(ms: number): ImpactStyle {
  if (ms <= 10) return ImpactStyle.Light;
  if (ms <= 30) return ImpactStyle.Medium;
  return ImpactStyle.Heavy;
}

let lastAt = 0;

function impact(ms: number): void {
  const now = performance.now();
  // Rapid tapping can ask for dozens a second; the motor can't keep up, so space them out.
  if (ms <= 10 && now - lastAt < 40) return;
  lastAt = now;
  void Haptics.impact({ style: styleFor(ms) }).catch(() => {});
}

export function vibrate(pattern: number | number[]): void {
  if (!native()) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Not allowed in this context; ignore.
      }
    }
    return;
  }
  if (typeof pattern === 'number') {
    // A long single buzz is a big moment.
    if (pattern >= 100) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else impact(pattern);
    return;
  }
  // Patterns: one tap for each "on" part, at its moment; a long last part ends in a success ripple.
  let at = 0;
  pattern.forEach((ms, i) => {
    if (i % 2 === 0) {
      const big = i === pattern.length - 1 && ms >= 100;
      const t = at;
      window.setTimeout(() => {
        if (big) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        else {
          lastAt = 0;
          impact(ms);
        }
      }, t);
    }
    at += ms;
  });
}

/** Whether this device can vibrate at all: the phone app, or a touch browser that supports it. */
export function canVibrate(): boolean {
  return native() || ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches);
}
