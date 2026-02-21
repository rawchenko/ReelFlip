# Gradle Warning Blockers

Updated: 2026-02-21

## Scope

This file tracks residual Gradle warnings that are outside ReelFlip build-script ownership after eliminating `Build file '...': line ...` deprecations.

## Residual Blockers

1. **AGP internal plugin deprecation (Gradle 10)**
- Source: Gradle problems report
- Plugin IDs: `com.android.internal.library`, `com.android.internal.application`
- Message: `Retrieving attribute with a null key. This behavior has been deprecated.`
- Detail: `This will fail with an error in Gradle 10.0.`
- Evidence file: `/Users/rawchenko/Documents/GitHub/ReelFlip/android/build/reports/problems/problems-report.html`
- Rationale for deferral: Emitted from Android Gradle Plugin internals; not from project `build.gradle` scripts. Requires upstream AGP/Expo dependency updates.

2. **Expo module gradle plugin Kotlin API deprecation (AGP 9)**
- File: `/Users/rawchenko/Documents/GitHub/ReelFlip/node_modules/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt:9`
- Message: `'var targetSdk: Int?' is deprecated. Will be removed from library DSL in v9.0. Use testOptions.targetSdk or/and lint.targetSdk instead.`
- Rationale for deferral: This warning is in Expo's plugin source code. Local build scripts are already clean; durable fix should come from Expo upstream release.

## Current Status

- `Build file '...': line ...` deprecation warnings: **0**
- Local CLI build and verification: **passing**
