# ReelFlip - Design Notes (Current UI)

## Current Visual State

The app currently uses a simple light-theme scaffold.

From `app.json`:

- `userInterfaceStyle` is `light`
- Splash uses white default background
- Orientation is portrait

From `constants/app-styles.ts`:

- `appStyles.card`: white background, gray border, radius `2`, padding `4`
- `appStyles.screen`: `flex: 1`, `gap: 16`, horizontal padding `8`
- `appStyles.stack`: vertical gap `8`
- `appStyles.title`: size `20`, bold

## Current Screen Composition

Home screen (`app/index.tsx`) layout order:

1. App config card (name + URL)
2. Account feature section
3. Network feature section

Each feature uses the shared `appStyles` object for basic spacing and card grouping.

## Interaction Patterns In Code Today

- Button/touch behavior is default React Native component behavior.
- No custom gesture-driven navigation or animation system is implemented in UI code.
- No custom typography system or theme token layer is implemented yet.

## Design Maintenance Guidelines

- Extend `constants/app-styles.ts` for reusable patterns before introducing per-screen style duplication.
- Keep section structure and spacing consistent with existing `screen` and `stack` rules.
- When changing app-wide visual direction, update both `app.json` UI settings and shared styles together.
- Document only styles and interaction behavior that are implemented in the repository.
