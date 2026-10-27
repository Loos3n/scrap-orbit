# Phone app

The game is a web app wrapped as a native app with [Capacitor](https://capacitorjs.com).
`capacitor.config.ts` holds the app settings; `android/` is the Android Studio project.

## Android

Every push builds a test APK on GitHub Actions (`.github/workflows/android.yml`) and
attaches it to a new release. The newest one is always at **Releases > Latest**.

To install it, open the release on the phone, tap `scrap-orbit.apk`, open the download and
allow installs from the browser when Android asks. Test builds are signed with the public
key in `android/app/sideload.keystore`, so each new build installs over the last one and
keeps the save. A Google Play release needs its own private key (never commit it).

Build locally (needs the Android SDK):

```sh
npm run android        # web build + copy into android/
cd android && ./gradlew assembleDebug
```

App icon and splash sources live in `assets/`; regenerate with
`npx @capacitor/assets generate --android --iconBackgroundColor '#0b0d26' --splashBackgroundColor '#0b0d26'`.

## iOS (not set up yet)

iOS builds need Xcode, which only runs on macOS, plus an Apple Developer account
($99/year) to install on a phone through TestFlight or the App Store. Once those exist:
`npx cap add ios`, then build in Xcode. A macOS GitHub Actions runner can do the build,
but signing still needs the Apple account's certificates as repository secrets.
