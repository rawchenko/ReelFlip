# ReelFlip Design System Audit

**Date:** March 8, 2026
**Scope:** Color tokens, typography, spacing, component architecture

---

## Summary

| Metric | Value |
|---|---|
| **Components reviewed** | 33 (.tsx files across features/ and components/) |
| **Token files** | 5 (palette, semantic-colors, typography, app-styles, 3 design specs) |
| **Hardcoded color violations** | 0 (excellent) |
| **Spacing token coverage** | ~40% (significant gap) |
| **Typography token coverage** | ~30% (font families tokenized; sizes/scales are not) |
| **Overall score** | **68 / 100** |

---

## Color Tokens — Score: 95/100

The color system is the strongest part of the design system. It follows a clean three-layer architecture:

**Layer 1 → Primitive palette** (`palette.ts`): Raw color scales (neutral, gray, yellow, red, green) plus alpha helpers.
**Layer 2 → Semantic tokens** (`semantic-colors.ts`): Purpose-driven mappings like `text.primary`, `accent.badge`, `status.danger.background`.
**Layer 3 → Feature design specs** (`*-design-spec.ts`): Screen-level aliases that map semantic tokens to feature-specific roles.

### Issues Found

| Issue | Location | Recommendation |
|---|---|---|
| Hardcoded hex in `semantic-colors.ts` | `text.primary: '#f5f8ff'`, `text.secondary: '#d6deed'`, `text.muted: '#8fa6cc'`, `text.chartAxis: '#7f8aa2'`, `text.info: '#93C5FD'`, `text.warningMuted: '#FDBA74'`, 5 border values, 4 overlay values, 3 chart background values, `status.warning` values | Move these ~20 raw hex values into `palette.ts` scales, then reference from semantic tokens |
| `misc` bucket growing | `palette.ts` lines 111–134 | 23 one-off colors in `misc` — consider organizing into sub-groups (chart, swap, feed, asset) |
| Inconsistent gray scales | `neutral` (blue-tinted) vs `gray` (pure) | Documented but could confuse new contributors — add inline guidance on when to use which |
| Non-standard scale steps | `gray.825`, `gray.850`, `gray.925`, `red.450`, `red.550`, `yellow.75`, `yellow.150` | Custom steps break the Tailwind-style 50→950 convention — document the rationale or consolidate |

---

## Spacing — Score: 35/100

Spacing is the **biggest gap** in the design system. There is no centralized spacing scale.

### Current State

Values are defined ad-hoc in design specs and directly in components. The most common values used across the codebase:

| Value (px) | Occurrences | Typical use |
|---|---|---|
| 4 | ~8 | Fine gaps, badge padding |
| 6 | ~6 | Small gaps |
| 8 | ~14 | Standard element gap |
| 12 | ~13 | Component spacing, content gaps |
| 16 | ~15 | Section padding, card padding |
| 20 | ~5 | Header horizontal padding |
| 24 | ~8 | Screen edge padding, large gaps |
| 32 | ~3 | Large section spacing |

**19 different `borderRadius` values** found (0, 2, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 40, 60, 70, 120, 999). This suggests organic growth without a defined radius scale.

### Recommendation

Define a spacing scale in `constants/spacing.ts`:

```typescript
export const spacing = {
  0: 0,
  1: 4,
  2: 6,
  3: 8,
  4: 12,
  5: 16,
  6: 20,
  7: 24,
  8: 32,
  9: 40,
  10: 56,
} as const

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 28,
  full: 999,
} as const
```

---

## Typography — Score: 45/100

Font families are well-tokenized (Inter + Space Grotesk). Font sizes and line heights are **not tokenized** — they're hardcoded in every component.

### Font Size Distribution

| Size (px) | Occurrences | Typical role |
|---|---|---|
| 11 | 3 | Fine print, badges |
| 12 | 7 | Labels, footnotes |
| 13 | 7 | Secondary/caption text |
| 14 | 17 | Standard body |
| 15 | 5 | Body variant |
| 16 | 15 | Prominent body |
| 17 | 3 | Subheading |
| 18 | 14 | Section headers |
| 20 | 2 | Small titles |
| 22 | 4 | Medium titles |
| 24 | 4 | Screen titles |
| 28 | 2 | Large titles (activity header) |
| 30–36 | 4 | Display/hero text |

### Recommendation

Extend `constants/typography.ts` with a type scale:

```typescript
export const typeScale = {
  xs:      { fontSize: 11, lineHeight: 14 },
  sm:      { fontSize: 13, lineHeight: 18 },
  base:    { fontSize: 14, lineHeight: 20 },
  md:      { fontSize: 16, lineHeight: 22 },
  lg:      { fontSize: 18, lineHeight: 24 },
  xl:      { fontSize: 22, lineHeight: 28 },
  '2xl':   { fontSize: 28, lineHeight: 34 },
  '3xl':   { fontSize: 36, lineHeight: 42 },
} as const
```

---

## Component Architecture — Score: 70/100

### Structure

The codebase uses **feature-based architecture** with 6 modules: account, activity, feed, network, onboarding, swap. Each feature is self-contained with its own types, hooks, API clients, and components.

### Naming Consistency

| Convention | Pattern | Compliance |
|---|---|---|
| File naming | kebab-case | ✅ Consistent |
| Component exports | PascalCase | ✅ Consistent |
| Hooks | `use-{name}.tsx` | ✅ Consistent |
| Design specs | `{feature}-design-spec.ts` | ✅ Consistent (3 of 6 features) |
| API clients | `{feature}-client.ts` in `api/` | ✅ Consistent |

### Issues

| Issue | Details | Recommendation |
|---|---|---|
| No shared UI primitives | Only 2 files in `components/` — no reusable Button, Card, Input, Modal, Badge | Extract common patterns into a shared `ui/` directory |
| Oversized components | `swap-flow.tsx` is ~70KB, `token-card.tsx` is ~35KB | Break into smaller composable sub-components |
| Design spec coverage | Only 3 of 6 features have design specs (activity, feed, swap) | Add specs for account, network, onboarding |
| Swap spacing not tokenized | `swap-design-spec.ts` defines colors only — all spacing in `swap-flow.tsx` is hardcoded | Add spacing/layout section to swap design spec |

---

## Component Completeness

| Component Area | Tokens | States | Variants | Docs | Score |
|---|---|---|---|---|---|
| Color palette | ✅ | — | — | ✅ JSDoc | 9/10 |
| Semantic colors | ✅ | — | — | ✅ JSDoc | 9/10 |
| Typography (families) | ✅ | — | — | ❌ | 7/10 |
| Typography (scale) | ❌ | — | — | ❌ | 2/10 |
| Spacing | ❌ | — | — | ❌ | 1/10 |
| Border radius | ❌ | — | — | ❌ | 1/10 |
| Tab bar | ✅ colors | ✅ active/inactive | ✅ feed variant | ❌ | 7/10 |
| Buttons | ⚠️ partial | ⚠️ disabled only | ⚠️ buy/sell only | ❌ | 4/10 |
| Status badges | ✅ colors | ✅ 4 statuses | — | ❌ | 6/10 |
| Charts | ✅ colors | ✅ bull/bear | ✅ baseline/candle | ❌ | 8/10 |
| Activity rows | ✅ spec | ✅ | — | ❌ | 7/10 |
| Swap flow | ✅ colors | ⚠️ inline | ⚠️ inline | ❌ | 5/10 |

---

## Priority Actions

### 1. Create a spacing scale (High Impact)

Add `constants/spacing.ts` with a defined scale. This is the single highest-leverage improvement — it would bring consistency to the 19+ borderRadius values and dozens of ad-hoc padding/margin/gap values scattered across the codebase.

### 2. Create a type scale (High Impact)

Extend `typography.ts` with named size presets (xs through 3xl). Almost every component hardcodes fontSize — a centralized scale would reduce drift and speed up development.

### 3. Move remaining raw hex values out of `semantic-colors.ts` (Medium Impact)

About 20 hex values bypass the palette. Moving them into `palette.ts` maintains the three-layer architecture and makes future theming (e.g., light mode) feasible.

### 4. Extract shared UI primitives (Medium Impact, High Effort)

The lack of reusable Button, Card, Input, and Badge components means styling is duplicated across features. Start with the most repeated patterns (buttons appear in swap, feed, and activity).

### 5. Break up oversized components (Low Urgency)

`swap-flow.tsx` (70KB) and `token-card.tsx` (35KB) are maintenance risks. Decomposing them would improve testability and make the design system easier to enforce.
