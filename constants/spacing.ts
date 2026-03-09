/**
 * Spacing scale for ReelFlip.
 *
 * Derived from the most common values already in use across the codebase.
 * Components should reference these tokens instead of embedding raw numbers.
 *
 * Base unit: 4px. The scale follows a pragmatic progression that covers
 * every spacing value currently used in the app, avoiding the need for
 * arbitrary one-offs.
 *
 * Usage:
 *   import { spacing, radii } from '@/constants/spacing'
 *
 *   { gap: spacing[3], borderRadius: radii.lg }
 */

// ---------------------------------------------------------------------------
// Spacing scale — padding, margin, gap
// ---------------------------------------------------------------------------
export const spacing = {
  /** 0px — no spacing */
  0: 0,
  /** 2px — hairline gaps (badge overlap offsets) */
  0.5: 2,
  /** 4px — fine gaps, badge padding, label margins */
  1: 4,
  /** 6px — small inner gaps */
  1.5: 6,
  /** 8px — standard element gap, icon padding */
  2: 8,
  /** 10px — compact component padding */
  2.5: 10,
  /** 12px — content gaps, row padding, section spacing */
  3: 12,
  /** 14px — pill padding, compact card padding */
  3.5: 14,
  /** 16px — section padding, card padding, screen gutters */
  4: 16,
  /** 18px — form input horizontal padding */
  4.5: 18,
  /** 20px — header horizontal padding */
  5: 20,
  /** 24px — screen edge padding, large section gaps */
  6: 24,
  /** 28px — title-size padding */
  7: 28,
  /** 32px — large section spacing */
  8: 32,
  /** 40px — major section gaps */
  10: 40,
  /** 48px — avatar/icon container size */
  12: 48,
  /** 56px — CTA button height, safe area offsets */
  14: 56,
  /** 72px — activity row height */
  18: 72,
  /** 80px — tab bar height, card shell padding */
  20: 80,
} as const

// ---------------------------------------------------------------------------
// Border radius scale
// ---------------------------------------------------------------------------
export const radii = {
  /** 0px — sharp corners */
  none: 0,
  /** 8px — subtle rounding (small cards, inputs) */
  sm: 8,
  /** 12px — badge radius, chips */
  md: 12,
  /** 14px — activity row corners */
  DEFAULT: 14,
  /** 16px — CTA buttons, standard cards */
  lg: 16,
  /** 22px — large pills, swap cards */
  xl: 22,
  /** 28px — oversized pill buttons */
  '2xl': 28,
  /** 999px — fully round (circles, pill badges) */
  full: 999,
} as const

// ---------------------------------------------------------------------------
// Sizing helpers — icon and avatar sizes used across components
// ---------------------------------------------------------------------------
export const iconSize = {
  /** 16px — inline icons (labels, captions) */
  xs: 16,
  /** 20px — small icons (list items, navigation) */
  sm: 20,
  /** 24px — standard icons (headers, buttons) */
  md: 24,
  /** 32px — badge overlay icons */
  lg: 32,
  /** 48px — avatar / icon containers */
  xl: 48,
} as const
