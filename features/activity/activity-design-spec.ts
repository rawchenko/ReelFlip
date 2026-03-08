import { alpha } from '@/constants/palette'
import { semanticColors } from '@/constants/semantic-colors'

export const activityDesignSpec = {
  colors: {
    background: semanticColors.app.background,
    rowBackground: semanticColors.tabBar.background,
    badgeBackground: semanticColors.app.backgroundPanel,
    heading: semanticColors.text.headingOnDark,
    sectionLabel: semanticColors.text.dimmed,
    primaryText: semanticColors.text.headingOnDark,
    secondaryText: semanticColors.text.dimmed,
    receivedAmount: semanticColors.text.success,
    failedText: alpha.white35,
  },
  header: {
    horizontalPadding: 20,
    topPadding: 56,
    bottomPadding: 12,
    titleFontSize: 28,
    titleLineHeight: 34,
    titleLetterSpacing: -0.5,
  },
  section: {
    horizontalPadding: 16,
    labelVerticalGap: 4,
    rowGap: 8,
    sectionGap: 12,
    listBottomPadding: 16,
  },
  row: {
    height: 72,
    borderRadius: 14,
    horizontalPadding: 12,
    contentGap: 12,
    iconContainerSize: 48,
    badgeSize: 32,
    badgeOverlapOffset: 16,
  },
} as const
