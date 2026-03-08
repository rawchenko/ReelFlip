import { alpha, black, gray, green, misc, neutral, red, white, yellow } from '@/constants/palette'

/**
 * Semantic color tokens — the **only** colors components should reference.
 *
 * Every value here maps back to a primitive in `palette.ts`.
 * When you need a new color, add a semantic token here and wire it to a
 * palette value — never drop a raw hex into a component file.
 */
export const semanticColors = {
  // ── Surfaces ──────────────────────────────────────────────────────────
  app: {
    backgroundCanvas: black,
    background: black,
    backgroundElevated: black,
    backgroundPanel: gray[900],        // #111111
    backgroundPanelAlt: gray[850],     // #1A1A1A
    backgroundDark: gray[825],         // #222222
    backgroundDeep: gray[925],         // #0A0A0A
  },

  // ── Glass / frosted surfaces ────────────────────────────────────────
  surface: {
    glass: alpha.white3,
    glassBorder: alpha.white5,
    glassLight: alpha.white4,
    glassMedium: alpha.white7,
    glassStrong: alpha.white8,
    glassStrongBorder: alpha.white6,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────
  tabBar: {
    background: alpha.white10,
    border: alpha.white12,
    activeIndicator: white,
    inactiveOpacity: 0.5,
    backdropGradientTop: alpha.black22,
    backdropGradientBottom: alpha.black52,
    backdropLayer: alpha.black30,
    activeGradientTop: alpha.white6,
    activeGradientBottom: 'rgba(255, 255, 255, 0.00)',
    feedBackground: misc.feedTabBg,          // #161616
    feedBorder: misc.feedTabBorder,           // #2A2A2A
    feedGradientTop: misc.feedTabGradientTop, // #242424
    feedGradientBottom: misc.feedTabBg,       // #161616
  },

  // ── Buttons ───────────────────────────────────────────────────────────
  button: {
    buyBackground: white,
    buyText: black,
    sellBackground: alpha.white20,
    sellText: white,
    sellBorder: alpha.white40,
    disabledBackground: misc.disabledButtonBg,
  },

  // ── Accent (brand yellow) ────────────────────────────────────────────
  accent: {
    primary: yellow[500],          // #E8DB00  — default brand accent
    bright: yellow[200],           // #FFF433  — gradient highlight end
    soft: yellow[300],             // #F7E957  — lighter text on dark
    muted: yellow[600],            // #D4C532  — subdued / secondary accent
    badge: yellow[400],            // #FACC15  — avatar badges, indicators
    background: alpha.yellow14,    // subtle accent fill
    backgroundSubtle: alpha.yellow8,
    backgroundWarm: alpha.warmYellow10,
    backgroundWarmSubtle: alpha.warmYellow5,
    backgroundWarmMedium: alpha.warmYellow8,
    border: alpha.yellow22,        // accent border
    borderWarm: alpha.warmYellow24,
    borderStrong: alpha.yellow52,
    borderWarmMedium: alpha.warmYellow18,
    glowTop: alpha.yellow18,
    glowBottom: alpha.yellow4,
    pillBackground: alpha.yellow15,
    /** Gradient pair for primary CTA buttons */
    gradientStart: yellow[500],    // #E8DB00
    gradientEnd: yellow[200],      // #FFF433
  },

  // ── Text ──────────────────────────────────────────────────────────────
  text: {
    primary: '#f5f8ff',
    secondary: '#d6deed',
    muted: '#8fa6cc',
    neutralMuted: gray[500],       // #888888 — pure gray muted (onboarding, card labels)
    tertiary: neutral[500],        // #94A3B8
    quaternary: gray[400],         // #9CA3AF
    headingOnDark: white,
    bodyOnDark: neutral[100],      // #F8FAFC
    onLight: black,
    onLightSubtle: gray[950],      // #09090B
    tintedLight: gray[200],        // #D4D4D8
    yellowTint: yellow[75],        // #FFFDEE
    chartAxis: '#7f8aa2',
    chartLabel: neutral[600],      // #64748B
    info: '#93C5FD',
    success: green[500],           // #4ADE80
    successMuted: green[300],      // #86EFAC
    danger: red[500],              // #F87171
    dangerMuted: red[200],         // #FCA5A5
    warningMuted: '#FDBA74',
    // White-at-opacity text hierarchy (for layered text on dark backgrounds)
    dimmed: alpha.white58,
    subtle: alpha.white48,
    faint: alpha.white42,
    hint: alpha.white36,
    ghost: alpha.white32,
    disabled: alpha.white22,
    errorSoft: misc.errorTextSoft,   // #D77C7C — muted error (onboarding)
  },

  // ── Icons ──────────────────────────────────────────────────────────────
  icon: {
    primary: white,
    secondary: alpha.white66,
    muted: alpha.white42,
    faint: alpha.white32,
    onLight: black,
    neutralMuted: gray[600],       // #666666 — info icons on dark
  },

  // ── Input fields ───────────────────────────────────────────────────────
  input: {
    placeholder: alpha.white18,
    background: alpha.white8,
    border: alpha.white6,
  },

  // ── Borders ───────────────────────────────────────────────────────────
  border: {
    light: '#d1d1d1',
    default: '#1b2a47',
    muted: '#314570',
    strong: '#1C1D24',
    subtle: gray[800],             // #333333
    subtleDark: gray[825],         // #222222
    subtleMid: gray[700],          // #444444
    checkboxMuted: misc.checkboxBorderMuted,  // #555555
    panel: neutral[900],           // #1E293B
    chart: '#1a2740',
  },

  // ── Status banners / badges ───────────────────────────────────────────
  status: {
    success: {
      background: green[900],      // #14532D
      text: green[300],            // #86EFAC
    },
    danger: {
      background: red[950],        // #451A1A
      text: red[200],              // #FCA5A5
      surface: alpha.red14,
      surfaceBorder: alpha.red26,
      surfaceDark: alpha.redDark44,
      surfaceDarkBorder: alpha.red18,
      buttonBackground: red[450],  // #FF4747
      bannerBackground: red[550],  // #FF4545
      bannerBorder: alpha.redBright60,
    },
    warning: {
      background: '#422006',
      text: '#FDBA74',
    },
    info: {
      background: neutral[900],    // #1E293B
      text: '#93C5FD',
    },
  },

  // ── Overlays ──────────────────────────────────────────────────────────
  overlay: {
    topStrong: 'rgba(10, 11, 16, 0.9)',
    topClear: 'rgba(10, 11, 16, 0)',
    bottomMid: 'rgba(10, 11, 16, 0.8)',
    sheet: alpha.navyOverlay55,
  },

  // ── Charts ────────────────────────────────────────────────────────────
  chart: {
    background: '#040810',
    backgroundSurface: '#050a12',
    backgroundPlot: '#03070d',
    feedBackground: misc.chartDarkBg,
    bullBody: green[500],          // #4ADE80
    bullWick: '#8EF3B1',
    bullGlow: alpha.green24,
    bullTrail: 'rgba(74, 222, 128, 0.15)',
    bullFallback: misc.chartBullFallback,
    bullFallbackGlow: alpha.green30,
    bearBody: red[400],            // #F98282
    bearWick: red[300],            // #FFA5B0
    bearGlow: alpha.red24,
    bearTrail: 'rgba(249, 130, 130, 0.15)',
    bearFallback: misc.chartBearFallback,
    bearFallbackGlow: alpha.red28,
    grid: alpha.chartGrid,
    priceLine: alpha.chartPriceLine,
    skeleton: alpha.chartSkeleton,
    skeletonGrid: alpha.chartSkeletonGrid,
    skeletonLoadColors: [alpha.chartSkeletonLoadA, alpha.chartSkeletonLoadB, alpha.chartSkeletonLoadC] as const,
    baselineGreenLine: misc.chartBaselineGreen,
    baselineRedLine: misc.chartBaselineRed,
    baselineGreenFillStrong: alpha.chartBaselineGreenStrong,
    baselineGreenFillSoft: alpha.chartBaselineGreenSoft,
    baselineRedFillStrong: alpha.chartBaselineRedStrong,
    baselineRedFillSoft: alpha.chartBaselineRedSoft,
    refLine: alpha.chartRefLine,
    feedText: alpha.chartFeedText,
    feedGrid: alpha.chartSkeletonGrid,
  },

  // ── Trust badges ──────────────────────────────────────────────────────
  trust: {
    background: alpha.green18,
    border: alpha.green55,
    text: green[100],              // #D7FFE9
  },

  // ── Disabled / inactive states ────────────────────────────────────────
  disabled: {
    gradientStart: '#525252',
    gradientEnd: '#3F3F46',
  },

  // ── Avatar ─────────────────────────────────────────────────────────────
  avatar: {
    fallbackBackground: misc.purple,
    fallbackBorder: misc.purpleBorder,
    fallbackText: white,
  },

  // ── Asset badge colors (per-token brand) ────────────────────────────────
  assetBadge: {
    skr: green[500],              // #4ADE80
    sol: misc.assetSolBadge,      // #8B5CF6
    usdc: misc.assetUsdcBadge,    // #2F80ED
    default: yellow[400],         // #FACC15
  },
} as const
