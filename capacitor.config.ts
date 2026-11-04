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
  },
};

export default config;
