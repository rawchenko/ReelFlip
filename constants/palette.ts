/**
 * Primitive color palettes for ReelFlip.
 *
 * These are raw color values — **never reference them directly in components**.
 * Always go through `semantic-colors.ts` which maps these primitives to
 * purpose-driven tokens (e.g. `semanticColors.text.primary`).
 *
 * Scale: 50 (lightest) → 950 (darkest), Tailwind-style.
 */

// ---------------------------------------------------------------------------
// Neutral — blue-tinted gray ramp (Tailwind Slate)
// ---------------------------------------------------------------------------
export const neutral = {
  50: '#FFFFFF',
  100: '#F8FAFC',
  200: '#F1F5F9',
  300: '#E2E8F0',
  400: '#CBD5E1',
  500: '#94A3B8',
  600: '#64748B',
  700: '#475569',
  800: '#334155',
  900: '#1E293B',
  950: '#0F172A',
} as const

// Pure extremes (useful for backgrounds/text on dark theme)
export const black = '#000000' as const
export const white = '#FFFFFF' as const

// ---------------------------------------------------------------------------
// Gray — pure neutral ramp (Tailwind Zinc-like, no tint)
// Used for onboarding surfaces, borders, and secondary UI.
// ---------------------------------------------------------------------------
export const gray = {
  50: '#FAFAFA',
  100: '#F5F5F5',
  200: '#D4D4D8',
  300: '#A3A3A3',
  400: '#9CA3AF',
  500: '#888888',
  600: '#666666',
  700: '#444444',
  800: '#333333',
  825: '#222222',
  850: '#1A1A1A',
  900: '#111111',
  925: '#0A0A0A',
  950: '#09090B',
} as const

// ---------------------------------------------------------------------------
// Yellow — brand accent
// ---------------------------------------------------------------------------
export const yellow = {
  50: '#FFFEF0',
  75: '#FFFDEE',
  100: '#FFF9C2',
  150: '#FFF600',
  200: '#FFF433',
  300: '#F7E957',
  400: '#FACC15',
  500: '#E8DB00',
  600: '#D4C532',
  700: '#B8A20E',
  800: '#8A7A0A',
  900: '#5C5108',
  950: '#3D3604',
} as const

// ---------------------------------------------------------------------------
// Red — danger / bearish / sell
// ---------------------------------------------------------------------------
export const red = {
  50: '#FFF5F5',
  100: '#FEE2E2',
  200: '#FCA5A5',
  300: '#FFA5B0',
  400: '#F98282',
  450: '#FF4747',
  500: '#F87171',
  550: '#FF4545',
  600: '#EF4444',
  700: '#E74837',
  800: '#DC2626',
  900: '#991B1B',
  950: '#451A1A',
} as const

// ---------------------------------------------------------------------------
// Green — success / bullish / buy
// ---------------------------------------------------------------------------
export const green = {
  50: '#F0FFF4',
  100: '#D7FFE9',
  200: '#BBF7D0',
  300: '#86EFAC',
  400: '#6FEFB4',
  500: '#4ADE80',
  600: '#22C55E',
  700: '#16A34A',
  800: '#15803D',
  900: '#14532D',
  950: '#052E16',
} as const

// ---------------------------------------------------------------------------
// One-off named colors (too specific for a scale)
// ---------------------------------------------------------------------------
export const misc = {
  swapCardBg: '#1A1A1E',
  swapPillBg: '#2A2A30',
  swapEyebrow: '#6E6E76',
  swapSecondaryText: '#4A4A52',
  purple: '#5B5BD6',
  purpleBorder: 'rgba(196, 181, 253, 0.9)',
  chartDarkBg: '#05070b',
  chartBaselineGreen: '#22d3a5',
  chartBaselineRed: '#ff3b57',
  chartBullFallback: '#7dffd2',
  chartBearFallback: '#ff8b95',
  assetSolBadge: '#8B5CF6',
  assetUsdcBadge: '#2F80ED',
  disabledButtonBg: '#5A5A5A',
  // iOS system colors (used in swap result screens)
  iosRed: '#FF3B30',
  iosGreen: '#34C759',
  iosAmber: '#FFCC00',
  checkboxBorderMuted: '#555555',
  errorTextSoft: '#D77C7C',
  feedTabBg: '#161616',
  feedTabBorder: '#2A2A2A',
  feedTabGradientTop: '#242424',
  // App config colors (mirrored in app.json which requires static JSON)
  splashBackground: '#070d1a',
  androidIconBackground: '#E6F4FE',
  // Settings screen colors
  settingsBg: '#121212',
  settingsTitle: '#E6E1E5',
  settingsSubtitle: '#CAC4D0',
  settingsMuted: '#938F99',
  toggleOff: '#49454F',
  settingsDivider: '#2B2930',
  dangerSoft: '#F2B8B5',
  dangerSoftDark: '#601410',
} as const

// ---------------------------------------------------------------------------
// Alpha helpers — for overlays, borders, and glassy surfaces
//
// Naming: `{base}{opacity}` — e.g. `white8` = white at 8% opacity.
// ---------------------------------------------------------------------------
export const alpha = {
  transparent: 'rgba(0, 0, 0, 0)',

  // white
  white3: 'rgba(255, 255, 255, 0.03)',
  white4: 'rgba(255, 255, 255, 0.04)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white6: 'rgba(255, 255, 255, 0.06)',
  white7: 'rgba(255, 255, 255, 0.07)',
  white8: 'rgba(255, 255, 255, 0.08)',
  white10: 'rgba(255, 255, 255, 0.10)',
  white12: 'rgba(255, 255, 255, 0.12)',
  white18: 'rgba(255, 255, 255, 0.18)',
  white20: 'rgba(255, 255, 255, 0.20)',
  white22: 'rgba(255, 255, 255, 0.22)',
  white32: 'rgba(255, 255, 255, 0.32)',
  white35: 'rgba(255, 255, 255, 0.35)',
  white36: 'rgba(255, 255, 255, 0.36)',
  white40: 'rgba(255, 255, 255, 0.40)',
  white42: 'rgba(255, 255, 255, 0.42)',
  white44: 'rgba(255, 255, 255, 0.44)',
  white46: 'rgba(255, 255, 255, 0.46)',
  white48: 'rgba(255, 255, 255, 0.48)',
  white50: 'rgba(255, 255, 255, 0.50)',
  white54: 'rgba(255, 255, 255, 0.54)',
  white58: 'rgba(255, 255, 255, 0.58)',
  white60: 'rgba(255, 255, 255, 0.60)',
  white66: 'rgba(255, 255, 255, 0.66)',

  // black
  black22: 'rgba(0, 0, 0, 0.22)',
  black30: 'rgba(0, 0, 0, 0.30)',
  black52: 'rgba(0, 0, 0, 0.52)',
  black60: 'rgba(0, 0, 0, 0.60)',
  black80: 'rgba(0, 0, 0, 0.80)',
  black90: 'rgba(0, 0, 0, 0.90)',

  // green
  green18: 'rgba(111, 239, 180, 0.18)',
  green24: 'rgba(74, 222, 128, 0.24)',
  green30: 'rgba(54, 226, 169, 0.30)',
  green55: 'rgba(111, 239, 180, 0.55)',

  // red
  red14: 'rgba(239, 68, 68, 0.14)',
  red18: 'rgba(239, 68, 68, 0.18)',
  red24: 'rgba(249, 130, 130, 0.24)',
  red26: 'rgba(239, 68, 68, 0.26)',
  red28: 'rgba(239, 92, 112, 0.28)',
  redDark44: 'rgba(75, 5, 10, 0.44)',
  redBright60: 'rgba(255, 69, 69, 0.6)',

  // yellow (brand accent)
  yellow4: 'rgba(250, 204, 21, 0.04)',
  yellow8: 'rgba(250, 204, 21, 0.08)',
  yellow14: 'rgba(250, 204, 21, 0.14)',
  yellow15: 'rgba(250, 204, 21, 0.15)',
  yellow18: 'rgba(250, 204, 21, 0.18)',
  yellow22: 'rgba(250, 204, 21, 0.22)',
  yellow5: 'rgba(250, 204, 21, 0.05)',
  yellow52: 'rgba(250, 204, 21, 0.52)',

  // warm yellow (slightly different hue, #FFE100 base)
  warmYellow5: 'rgba(255, 225, 0, 0.05)',
  warmYellow8: 'rgba(255, 225, 0, 0.08)',
  warmYellow10: 'rgba(255, 225, 0, 0.10)',
  warmYellow18: 'rgba(255, 225, 0, 0.18)',
  warmYellow24: 'rgba(255, 225, 0, 0.24)',

  // chart-specific
  chartGrid: 'rgba(116, 129, 151, 0.26)',
  chartPriceLine: 'rgba(116, 129, 151, 0.1)',
  chartSkeleton: 'rgba(120, 130, 150, 0.16)',
  chartSkeletonGrid: 'rgba(120, 130, 150, 0.24)',
  chartBaselineGreenStrong: 'rgba(34, 211, 165, 0.32)',
  chartBaselineGreenSoft: 'rgba(34, 211, 165, 0.03)',
  chartBaselineRedStrong: 'rgba(255, 59, 87, 0.28)',
  chartBaselineRedSoft: 'rgba(255, 59, 87, 0.03)',
  chartRefLine: 'rgba(226, 232, 240, 0.62)',
  chartFeedText: 'rgba(185, 192, 205, 0.65)',
  chartSkeletonLoadA: 'rgba(71, 85, 105, 0.12)',
  chartSkeletonLoadB: 'rgba(71, 85, 105, 0.28)',
  chartSkeletonLoadC: 'rgba(71, 85, 105, 0.08)',

  // overlay
  navyOverlay55: 'rgba(2, 6, 23, 0.55)',
} as const
