# Scrap Orbit

A cozy space-salvage idle clicker for phones and the web. Tap your station's claw to salvage scrap, build drones, haulers, smelters, fabricators and orbital docks that salvage for you, and watch the station grow as you go.

<img src="docs/screenshot.png" alt="The station mid-game, with drones, haulers and smelters in orbit" width="320">

This is the **prototype**: the core loop with placeholder-quality art, built to find out whether the game is fun before the real art goes in.

## What's in the prototype

- Hand-painted space scene: nebula, ringed gas giant, shaded station with lit windows and beacons
- Tap the station to earn scrap: the claw yanks in debris, with glowing sparks, a shockwave and floating numbers
- 5 generator tiers, each visibly added to the station as you buy them
- Buy x1, x10, x100 or Max
- Milestones at 10, 25, 50, 100, ... owned that double a generator's output
- 14 upgrades: tap power, per-tier multipliers, and taps that scale with income
- Overdrive: 2x everything for 30 seconds, every 5 minutes, with warp-speed stars
- Synthesized sound effects (taps climb a musical scale), with a mute button
- Salvage crates that drift past now and then; tap one for a bonus
- Autosave every 30 seconds and when the app is hidden
- Offline earnings for up to 2 hours, shown when you come back

## Running it

Requires Node.js 20 or newer.

```sh
npm install
npm run dev          # local dev server; open the printed URL on your phone (same Wi-Fi)
npm test             # economy and pacing tests
npm run build        # production web build in dist/
npm run build:single # the whole game as one HTML file in dist-single/
```

## How it's built

- **TypeScript** with **Vite**
- **PixiJS** draws the station scene (`src/scene/`)
- Plain **HTML/CSS** for the HUD and menus (`src/ui/`, `src/style.css`)
- **break_infinity.js** for numbers far past what a normal float can hold
- Game rules live in `src/core/` with no rendering code, so they can be unit tested and simulated
- `src/core/pacing.test.ts` simulates an attentive player for 90 minutes and fails if the waits between purchases get too long

Tuning numbers (costs, outputs, upgrades, boost) are all in `src/core/config.ts`.

## Roadmap

1. **Prototype** (this): is the loop fun for 15 minutes?
2. **Vertical slice**: 10 to 12 tiers, the first prestige layer, final art style, sound
3. **Content and polish**: second prestige layer, achievements, challenges, cloud save
4. **Soft launch** on iOS and Android via Capacitor
5. **Global launch**

## License

MIT
