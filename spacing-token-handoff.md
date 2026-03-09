# Developer Handoff: Spacing Token System

**Date:** March 8, 2026
**Status:** Ready for implementation
**File:** `constants/spacing.ts`
**Priority:** High — addresses the #1 finding from the design system audit

---

## What Changed

A new `constants/spacing.ts` file introduces three token groups: `spacing`, `radii`, and `iconSize`. These replace the dozens of hardcoded numeric values currently scattered across component StyleSheets and design specs.

---

## Token Reference

### spacing

Maps named keys to pixel values. The scale uses a 4px base unit.

| Token | Value | Common use |
|---|---|---|
| `spacing[0]` | 0px | — |
| `spacing[0.5]` | 2px | Hairline gaps, badge overlap offsets |
| `spacing[1]` | 4px | Fine gaps, badge padding, label margins |
| `spacing[1.5]` | 6px | Small inner gaps |
| `spacing[2]` | 8px | Standard element gap, icon padding |
| `spacing[2.5]` | 10px | Compact component padding |
| `spacing[3]` | 12px | Content gaps, row padding, section spacing |
| `spacing[3.5]` | 14px | Pill padding, compact card padding |
| `spacing[4]` | 16px | Section padding, card padding, screen gutters |
| `spacing[4.5]` | 18px | Form input horizontal padding |
| `spacing[5]` | 20px | Header horizontal padding |
| `spacing[6]` | 24px | Screen edge padding, large section gaps |
| `spacing[7]` | 28px | Title-size padding |
| `spacing[8]` | 32px | Large section spacing |
| `spacing[10]` | 40px | Major section gaps |
| `spacing[12]` | 48px | Avatar/icon container size |
| `spacing[14]` | 56px | CTA button height, safe area offsets |
| `spacing[18]` | 72px | Activity row height |
| `spacing[20]` | 80px | Tab bar height, card shell padding |

### radii

Named border-radius values.

| Token | Value | Use |
|---|---|---|
| `radii.none` | 0px | Sharp corners |
| `radii.sm` | 8px | Subtle rounding (small cards, inputs) |
| `radii.md` | 12px | Badge radius, chips |
| `radii.DEFAULT` | 14px | Activity row corners |
| `radii.lg` | 16px | CTA buttons, standard cards |
| `radii.xl` | 22px | Large pills, swap cards |
| `radii['2xl']` | 28px | Oversized pill buttons |
| `radii.full` | 999px | Fully round (circles, pill badges) |

### iconSize

Standard icon and avatar dimensions.

| Token | Value | Use |
|---|---|---|
| `iconSize.xs` | 16px | Inline icons (labels, captions) |
| `iconSize.sm` | 20px | Small icons (list items, navigation) |
| `iconSize.md` | 24px | Standard icons (headers, buttons) |
| `iconSize.lg` | 32px | Badge overlay icons |
| `iconSize.xl` | 48px | Avatar / icon containers |

---

## Migration Guide

### Import

```typescript
import { spacing, radii, iconSize } from '@/constants/spacing'
```

### Before / After Examples

**Activity row (design spec):**

```typescript
// BEFORE — in activity-design-spec.ts
row: {
  height: 72,
  borderRadius: 14,
  horizontalPadding: 12,
  contentGap: 12,
  iconContainerSize: 48,
  badgeSize: 32,
}

// AFTER
row: {
  height: spacing[18],           // 72
  borderRadius: radii.DEFAULT,   // 14
  horizontalPadding: spacing[3], // 12
  contentGap: spacing[3],        // 12
  iconContainerSize: iconSize.xl,// 48
  badgeSize: iconSize.lg,        // 32
}
```

**Home card (design spec):**

```typescript
// BEFORE — in home-design-spec.ts
card: {
  infoHorizontalPadding: 16,
  infoVerticalPadding: 16,
  infoGap: 12,
  ctaHorizontalPadding: 16,
  ctaGap: 8,
  ctaRadius: 16,
  ctaHeight: 56,
  badgeRadius: 12,
  badgeHorizontalPadding: 8,
  badgeVerticalPadding: 4,
}

// AFTER
card: {
  infoHorizontalPadding: spacing[4],  // 16
  infoVerticalPadding: spacing[4],    // 16
  infoGap: spacing[3],               // 12
  ctaHorizontalPadding: spacing[4],   // 16
  ctaGap: spacing[2],                // 8
  ctaRadius: radii.lg,               // 16
  ctaHeight: spacing[14],            // 56
  badgeRadius: radii.md,             // 12
  badgeHorizontalPadding: spacing[2], // 8
  badgeVerticalPadding: spacing[1],   // 4
}
```

**Inline styles (direct component usage):**

```typescript
// BEFORE — in any component .tsx
<View style={{ gap: 12, paddingHorizontal: 16, borderRadius: 999 }}>

// AFTER
<View style={{ gap: spacing[3], paddingHorizontal: spacing[4], borderRadius: radii.full }}>
```

---

## Migration Plan

### Phase 1 — Design specs (low risk, high coverage)

Update the three existing design spec files to use spacing tokens. These files centralize most of the layout values so this single change propagates to all components that reference them.

| File | Estimated changes |
|---|---|
| `features/activity/activity-design-spec.ts` | ~10 values |
| `features/feed/home-design-spec.ts` | ~18 values |
| `features/swap/swap-design-spec.ts` | 0 (colors only — spacing Phase 2) |

### Phase 2 — Shared styles

Update `constants/app-styles.ts` which uses hardcoded padding, gap, fontSize, and borderRadius values.

| File | Estimated changes |
|---|---|
| `constants/app-styles.ts` | ~12 values |

### Phase 3 — Inline component styles

Work feature-by-feature through components with hardcoded spacing values. Priority order by volume of hardcoded values:

| Feature | Key file(s) | Estimated effort |
|---|---|---|
| swap | `swap-flow.tsx` (~70KB) | Large — most hardcoded values in codebase |
| feed | `token-card.tsx`, `custom-tab-bar.tsx` | Medium |
| activity | `activity-row.tsx`, `activity-screen-content.tsx` | Small (mostly uses spec already) |
| onboarding | All onboarding screens | Medium |
| account | Account screens | Small |

---

## Rules for New Code

1. **Never use raw numbers for spacing, padding, margin, gap, or borderRadius.** Always use a token from `constants/spacing.ts`.

2. **If the exact value you need isn't in the scale**, use the nearest token. If none is close enough, discuss adding a new step before hardcoding.

3. **Design specs should reference spacing tokens.** When adding spacing to a design spec (like `swap-design-spec.ts`), import from `constants/spacing.ts`.

4. **The `as const` assertion is intentional.** It gives TypeScript the literal numeric type, so tokens work everywhere raw numbers do — no type casting needed.

---

## Testing

No behavioral changes — this is a pure refactor. Validation approach:

- Visual regression: Screenshot each screen before and after migration to confirm pixel-identical output.
- TypeScript: All values are `number` literals, so no type errors are expected.
- Runtime: Token values are plain numbers with zero overhead.

---

## Files Delivered

| File | Description |
|---|---|
| `constants/spacing.ts` | New token file — spacing scale, radii, icon sizes |
| `spacing-token-handoff.md` | This handoff document |
| `design-system-audit.md` | Full audit that motivated this work |
