import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';

/*
 * Optional rewarded ads (core/rewards.ts keeps the daily allowance).
 * - Android app: Google AdMob. Until the game has its own AdMob account these are Google's
 *   official test ads, which pay nothing and are safe to tap. To go live, put the real ids in
 *   ADMOB below and in android/app/src/main/AndroidManifest.xml, and set TESTING to false.
 * - Web (the browser build and the playable preview): no ad network, so every ad offer is hidden
 *   (adsAvailable() is false). The sample card below only stands in when testing locally.
 */

export const ADMOB = {
  /** Google's sample rewarded ad unit for Android. */
  rewardedId: 'ca-app-pub-3940256099942544/5224354917',
  testing: true,
};

const native = () => Capacitor.isNativePlatform();

/** Ads can only really play in the phone app; the dev server keeps the sample card for testing. */
export const adsAvailable = () => native() || import.meta.env.DEV;
let ready: Promise<boolean> | null = null;

function init(): Promise<boolean> {
  ready ??= AdMob.initialize({ initializeForTesting: ADMOB.testing })
    .then(() => true)
    .catch(() => false);
  return ready;
}

/** Plays one rewarded ad. Resolves true only if the player watched it to the reward. */
export async function playRewardedAd(): Promise<boolean> {
  if (!native()) return sampleAd();
  try {
    if (!(await init())) return false;
    await AdMob.prepareRewardVideoAd({ adId: ADMOB.rewardedId, isTesting: ADMOB.testing });
    const reward = await AdMob.showRewardVideoAd();
    return !!reward;
  } catch {
    return false;
  }
}

/** The web stand-in: a 4 second card with a skip that forfeits the reward. */
function sampleAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.getElementById('sample-ad')!;
    const left = document.getElementById('sample-ad-left')!;
    const skip = document.getElementById('sample-ad-skip')!;
    let t = 4;
    left.textContent = String(t);
    el.hidden = false;
    const done = (ok: boolean) => {
      window.clearInterval(timer);
      el.hidden = true;
      skip.onclick = null;
      resolve(ok);
    };
    const timer = window.setInterval(() => {
      t--;
      left.textContent = String(Math.max(0, t));
      if (t <= 0) done(true);
    }, 1000);
    skip.onclick = () => done(false);
  });
}
