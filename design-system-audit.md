# Design System Audit — ReelFlip

**Date:** March 9, 2026
**Scope:** Token definitions, component adoption, hardcoded value detection
**Supersedes:** Previous audit from March 8, 2026

---

## Summary

| Metric | Value |
|---|---|
| **Token files** | 4 (`palette.ts`, `semantic-colors.ts`, `typography.ts`, `spacing.ts`) |
| **Design-spec files** | 6 (one per feature) |
| **Component files scanned** | 44 `.tsx` files |
| **Semantic-colors imports** | 32 files |
| **Typography imports** | 39 files |
| **Spacing token imports** | 4 component files (excluding design-specs) |
| **Hardcoded hex in components** | **0** |
| **Overall score** | **82 / 100** |

---

## Token Architecture

ReelFlip uses a well-designed **two-layer color system** with a feature-level design-spec layer on top:

1. **Primitives** (`palette.ts`) — Raw color scales (neutral, gray, yellow, red, green), alpha helpers, and a `misc` bag of one-offs.
2. **Semantic tokens** (`semantic-colors.ts`) — ~150+ purpose-driven tokens across 16 groups: app, surface, tabBar, button, accent, text, icon, input, border, status, resultHero, overlay, chart, trust, disabled, avatar, assetBadge.
3. **Feature design specs** (`*-design-spec.ts`) — Screen-level aliases mapping semantic tokens to feature-specific roles.

Typography tokens cover 2 font families with 8 weights. Spacing tokens define an 18-step base-4 scale, 8 radii, and 5 icon sizes.

---

## Color Tokens — Score: 93/100

### Hardcoded Hex in Components: **0 found**

No `.tsx` component files contain inline hex colors. This is excellent.

### Hardcoded `rgba()` in Components: **1 instance**

| File | Value | Fix |
|---|---|---|
| `settings-reset-dialog.tsx` | `rgba(0, 0, 0, 0.6)` | Use `semanticColors.overlay.sheet` or add `overlay.modal` |

### Direct Palette Imports (bypassing semantic layer): **4 files**

| File | Import | Severity |
|---|---|---|
| `onboarding.tsx` | `alpha` | Low |
| `onboarding-5.tsx` | `alpha` | Low |
| `tradingview-mini-chart.tsx` | `alpha` | Low |
| `currency-screen-content.tsx` | `white` | Medium — should use `semanticColors.text.headingOnDark` |

### Raw Hex in `semantic-colors.ts` Itself: ~20 values

These bypass `palette.ts`, breaking the two-layer contract:

- `text.primary: '#f5f8ff'`, `text.secondary: '#d6deed'`, `text.muted: '#8fa6cc'`
- `text.chartAxis`, `text.info`, `text.warningMuted`
- `border.light`, `border.default`, `border.muted`, `border.chart`
- `overlay.topStrong`, `overlay.topClear`, `overlay.bottomMid`
- `chart.background`, `chart.backgroundSurface`, `chart.backgroundPlot`
- `status.warning.background`, `status.warning.text`
- Several `resultHero` ring values

**Recommendation:** Move these into `palette.ts` so the semantic layer has no raw hex.

### `misc` Bucket: **37 one-off colors**

The `misc` object has grown into a junk drawer spanning swap, settings, feed, chart, and iOS system colors. Consider reorganizing into scoped sub-objects (`chartPrimitives`, `swapPrimitives`, etc.) or folding them into semantic-colors directly.

### Non-Standard Scale Steps

`gray` has custom steps (825, 850, 925) and `red` has 450/550, `yellow` has 75/150. These work fine but should be documented as intentional extensions of the Tailwind convention.

---

## Spacing Tokens — Score: 55/100

**The spacing scale exists and is well-designed**, but adoption is the weakest area:

- `spacing.ts` defines 18 spacing steps (base-4), 8 radii, and 5 icon sizes.
- **447 spacing-related style declarations** across 44 component files.
- **Only 4 component files** directly import spacing tokens.
- Design-spec files reference spacing tokens, giving indirect coverage to features that use their design spec.

### `app-styles.ts` — No Spacing Tokens

The shared `app-styles.ts` file uses all hardcoded values:

```
padding: 4, gap: 16, paddingHorizontal: 8, paddingHorizontal: 32,
marginTop: 8, borderRadius: 10, gap: 12, paddingHorizontal: 28
```

None reference `spacing[...]` or `radii[...]`.

**Recommendation:** `app-styles.ts` should be the showcase for spacing token adoption. Migrate it first as a reference for other files.

---

## Typography — Score: 88/100

### Font Family Adoption: Excellent

- 39 files import from `@/constants/typography`
- All `fontFamily` declarations use `interFontFamily.*` or `spaceGroteskFamily.*`
- Zero hardcoded font family strings
- `_layout.tsx` correctly sets Inter as the app-wide default

### Font Size Tokens: Not Defined

Font sizes are hardcoded numbers in every component (`fontSize: 14`, `fontSize: 20`, etc.). There is **100 total `fontSize` declarations** across 23 files.

**Recommendation:** Define a type scale in `typography.ts`:

```typescript
export const typeScale = {
  xs:    { fontSize: 11, lineHeight: 14 },
  sm:    { fontSize: 13, lineHeight: 18 },
  base:  { fontSize: 14, lineHeight: 20 },
  md:    { fontSize: 16, lineHeight: 22 },
  lg:    { fontSize: 18, lineHeight: 24 },
  xl:    { fontSize: 22, lineHeight: 28 },
  '2xl': { fontSize: 28, lineHeight: 34 },
  '3xl': { fontSize: 36, lineHeight: 42 },
} as const
```

---

## Design-Spec Adoption by Feature

| Feature | Components | Using Spec | Adoption |
|---|---|---|---|
| **Activity** | 3 | 3 | 100% |
| **Swap** | 1 | 1 | 100% |
| **Profile** | 8 | 8 | 100% |
| **Settings** | 12+ | 12+ | 100% |
| **Token Details** | 3 | 3 | 100% |
| **Feed** | 8 | 4 | **50%** |

The feed feature is the only outlier. These 4 components bypass `homeDesignSpec`:

- `mini-chart.tsx` — uses `semanticColors` directly
- `vertical-feed.tsx` — uses `semanticColors` directly
- `feed-placeholder-sheet.tsx` — uses `semanticColors` directly
- `tradingview-mini-chart.tsx` — imports from `palette.ts` directly

All other features have 100% design-spec compliance.

---

## Priority Actions

### 1. Adopt spacing tokens in components (High Impact)

The tokens exist — they just aren't used. Start with `app-styles.ts` as a showcase, then migrate component `StyleSheet.create` blocks. Target: replace the ~447 hardcoded spacing values with token references.

### 2. Create a shared type scale (High Impact)

Add `typeScale` to `typography.ts`. This would give the ~100 `fontSize` declarations a tokenized alternative and prevent size drift.

### 3. Consolidate feed components to use `homeDesignSpec` (Medium Impact)

Bring `mini-chart.tsx`, `vertical-feed.tsx`, `feed-placeholder-sheet.tsx`, and `tradingview-mini-chart.tsx` in line with the design-spec pattern every other feature follows.

### 4. Extract raw hex from `semantic-colors.ts` (Medium Impact)

Move the ~20 inline hex values into `palette.ts` to maintain the two-layer contract. This is essential groundwork if you ever want to support theming/light mode.

### 5. Reorganize `misc` palette bag (Low Impact)

Split the 37 one-off colors into scoped sub-objects or fold them into semantic tokens. The current `misc` bag obscures intent and makes it easy to add colors without thinking about reuse.

### 6. Fix the single `rgba()` hardcode (Quick Win)

Replace `rgba(0, 0, 0, 0.6)` in `settings-reset-dialog.tsx` with the existing `semanticColors.overlay.sheet` token.

---

## Strengths

- Two-layer color architecture is clean and well-enforced — zero hex colors in component files
- Feature-level design-spec pattern is a strong abstraction — 5 of 6 features at 100%
- Typography font family adoption is essentially perfect across 39 files
- Spacing token definitions are comprehensive (base-4 scale, radii, icon sizes)
- Alpha helper system is thorough and well-organized
- Semantic color naming is clear and self-documenting across 16 categories
- Consistent naming conventions (kebab-case files, design-spec pattern, hooks pattern)
