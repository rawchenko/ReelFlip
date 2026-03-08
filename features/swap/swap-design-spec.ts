import { alpha } from '@/constants/palette'
import { semanticColors } from '@/constants/semantic-colors'

/**
 * Swap-flow design tokens.
 *
 * Mirrors the pattern of `activityDesignSpec` and `homeDesignSpec`.
 * Every swap-flow component should reference these tokens instead of
 * embedding raw hex / rgba values.
 */
export const swapDesignSpec = {
  colors: {
    // ── Text ──────────────────────────────────────────────────────
    heading: semanticColors.text.headingOnDark,
    body: semanticColors.text.headingOnDark,
    bodyOnLight: semanticColors.text.onLight,
    bodyOnLightSubtle: semanticColors.text.onLightSubtle,
    subtitleMuted: alpha.white44,
    bodyMuted: semanticColors.text.subtle,
    labelMuted: semanticColors.text.hint,
    captionMuted: semanticColors.text.hint,
    textDisabled: semanticColors.text.disabled,
    textGhost: semanticColors.text.ghost,
    textFaint: semanticColors.text.faint,
    textDimmed: semanticColors.text.dimmed,
    textAction: semanticColors.text.dimmed,
    sliderLabel: alpha.white54,
    progressDescription: alpha.white46,

    // ── Accent text ─────────────────────────────────────────────
    accentPrimary: semanticColors.accent.primary,
    accentSoft: semanticColors.accent.soft,
    accentMuted: semanticColors.accent.muted,
    accentTint: semanticColors.text.yellowTint,
    tintedLight: semanticColors.text.tintedLight,

    // ── Status text ──────────────────────────────────────────────
    success: semanticColors.text.success,

    // ── Surfaces ─────────────────────────────────────────────────
    background: semanticColors.app.background,
    panelBackground: semanticColors.app.backgroundPanel,
    cardBackground: semanticColors.surface.glass,
    cardBorder: semanticColors.surface.glassBorder,

    // ── Asset pill / icon button ─────────────────────────────────
    pillBackground: semanticColors.surface.glassStrong,
    pillBorder: semanticColors.surface.glassStrongBorder,

    // ── Accent surfaces ──────────────────────────────────────────
    chipBackground: semanticColors.accent.backgroundWarm,
    chipBorder: semanticColors.accent.borderWarm,
    chipSelectedBackground: alpha.warmYellow24,  // intentionally matches borderWarm value
    chipSelectedBorder: semanticColors.accent.badge,
    labelBadgeBackground: semanticColors.accent.background,
    labelBadgeBorder: semanticColors.accent.border,
    quoteCardReceiveBackground: semanticColors.accent.backgroundWarmSubtle,

    // ── Danger surfaces ──────────────────────────────────────────
    chipDangerBackground: semanticColors.status.danger.surface,
    chipDangerBorder: semanticColors.status.danger.surfaceBorder,
    failureCardBackground: semanticColors.status.danger.surfaceDark,
    failureCardBorder: semanticColors.status.danger.surfaceDarkBorder,

    // ── Buttons ──────────────────────────────────────────────────
    secondaryButtonBackground: semanticColors.surface.glass,
    secondaryButtonBorder: semanticColors.surface.glassBorder,
    secondaryButtonDangerBackground: semanticColors.status.danger.bannerBackground,
    secondaryButtonDangerBorder: semanticColors.status.danger.bannerBorder,

    // ── Slider ───────────────────────────────────────────────────
    sliderThumbBackground: semanticColors.accent.badge,
    sliderTrackBackground: semanticColors.accent.backgroundWarmMedium,
    sliderTrackBorder: semanticColors.accent.borderWarmMedium,
    sliderGlowTop: semanticColors.accent.glowTop,
    sliderGlowBottom: semanticColors.accent.glowBottom,

    // ── Input ────────────────────────────────────────────────────
    inputPlaceholder: semanticColors.input.placeholder,

    // ── Processing rings ─────────────────────────────────────────
    processingInnerRing: semanticColors.accent.badge,
    processingMiddleRing: semanticColors.accent.pillBackground,
    processingOuterRing: semanticColors.accent.backgroundSubtle,
    processingNoticeBackground: semanticColors.surface.glassLight,
    processingNoticeBorder: semanticColors.surface.glassBorder,

    // ── Progress steps ───────────────────────────────────────────
    progressBadgeBackground: semanticColors.surface.glassMedium,
    progressBadgeActiveBorder: semanticColors.accent.borderStrong,
    progressBadgeCompleteBackground: semanticColors.accent.badge,
    progressRowActiveBackground: semanticColors.surface.glass,
    progressBadgeText: semanticColors.text.faint,

    // ── Provider badge ───────────────────────────────────────────
    providerBadgeBackground: semanticColors.surface.glassStrong,
    providerBadgeBorder: semanticColors.surface.glassStrongBorder,
    providerDot: semanticColors.accent.primary,

    // ── Result icons ─────────────────────────────────────────────
    resultHeroSuccess: semanticColors.accent.primary,
    resultHeroFailure: semanticColors.status.danger.buttonBackground,

    // ── Icon colors (for Ionicons color prop) ────────────────────
    iconPrimary: semanticColors.icon.primary,
    iconOnLight: semanticColors.icon.onLight,
    iconMuted: semanticColors.icon.muted,
    iconSecondary: semanticColors.icon.secondary,

    // ── Swap direction badge ─────────────────────────────────────
    swapDirectionBackground: semanticColors.surface.glassStrongBorder,

    // ── Misc surfaces ────────────────────────────────────────────
    summaryRowBorder: semanticColors.surface.glassBorder,
  },
} as const
