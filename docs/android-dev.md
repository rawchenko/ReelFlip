# Android Development Runbook

## First-Time Setup

1. Install Node.js and ensure at least one of these paths exists and is executable:
   - `/opt/homebrew/bin/node`
   - `/usr/local/bin/node`
2. Install Java and Android SDK (Android Studio).
3. From project root, install dependencies:
   - `npm install`
4. Generate native Android files:
   - `npm run android:build`

## Daily Development Flow

1. Start Metro for dev client:
   - `npm run dev`
2. Open Android Studio and load `/Users/rawchenko/Documents/GitHub/ReelFlip/android`.
3. Sync Gradle if prompted.
4. Run the `app` target on your emulator or connected device.

## Recovery: Android Studio Cannot Find `node`

1. Confirm node path on your machine:
   - `echo $NODE_BINARY`
   - `which node`
2. If needed, set `NODE_BINARY` for the current shell:
   - `export NODE_BINARY="$(which node)"`
3. Reinstall dependencies so patches are re-applied:
   - `rm -rf node_modules && npm install`
4. Regenerate native Android project:
   - `npm run android:build`
5. In Android Studio: `File` -> `Sync Project with Gradle Files`.

## Verification Commands

- Lightweight CI-equivalent checks:
  - `npm run ci`
- Full local confidence flow (includes native debug build):
  - `npm run verify:local`
- Native debug artifact build:
  - `npm run verify:android:debug`
- Native release artifact build:
  - `npm run verify:android:release`

## Expected Build Artifacts

- Debug APK:
  - `/Users/rawchenko/Documents/GitHub/ReelFlip/android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK:
  - `/Users/rawchenko/Documents/GitHub/ReelFlip/android/app/build/outputs/apk/release/app-release.apk`
