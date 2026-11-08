import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the web build in dist/ as a native app. See docs/mobile.md.
const config: CapacitorConfig = {
  appId: 'io.github.scraporbit.game',
  appName: 'Scrap Orbit',
  webDir: 'dist',
  backgroundColor: '#0b0d26',
  plugins: {
    SystemBars: {
      // The page already pads itself with env(safe-area-inset-*).
      initialViewportFitValueHint: 'cover',
      // Light status bar icons on the dark sky.
      style: 'DARK',
    },
    // Cloud save sign-in (src/cloud.ts): the phone's Google account picker; the web SDK signs in with its token.
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
