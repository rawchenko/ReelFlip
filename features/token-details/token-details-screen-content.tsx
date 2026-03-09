import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily, spaceGroteskFamily } from '@/constants/typography'
import type { TokenFeedItem } from '@/features/feed/types'
import { TokenDetailChart } from '@/features/token-details/token-detail-chart'
import { tokenDetailsDesignSpec as spec } from '@/features/token-details/token-details-design-spec'
import type { TokenActivityEvent } from '@/features/token-details/types'
import { PerformanceGrid } from '@/features/token-details/token-metrics-grid'
import { useTokenChart } from '@/features/token-details/use-token-chart'

interface TokenDetailsScreenContentProps {
  token: TokenFeedItem
  /** User's token balance in native units, if held */
  balance?: number | null
  /** User's token balance value in USD */
  balanceUsd?: number | null
  /** Activity events for this token */
  activity?: TokenActivityEvent[]
  onBuyPress?: () => void
  onSellPress?: () => void
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1_000) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (price >= 1) {
    return `$${price.toFixed(3)}`
  }

  if (price >= 0.01) {
    return `$${price.toFixed(4)}`
  }

  return `$${price.toPrecision(3)}`
}

function formatAbsoluteChange(price: number, pct: number): string {
  const change = price * (pct / 100)
  const sign = change >= 0 ? '+' : ''
  return `${sign}$${Math.abs(change).toFixed(2)}`
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }

  return `$${value.toFixed(2)}`
}

function truncateMint(mint: string): string {
  if (mint.length <= 12) {
    return mint
  }

  return `${mint.slice(0, 4)}...${mint.slice(-4)}`
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TokenDetailsScreenContent({
  token,
  balance,
  balanceUsd,
  activity = [],
  onBuyPress,
  onSellPress,
}: TokenDetailsScreenContentProps) {
  const router = useRouter()
  const { points, loading, timeRange, setTimeRange } = useTokenChart(token.pairAddress)
  const positiveTrend = token.priceChange24h >= 0
  const chartPoints = points.length > 0 ? points : token.sparkline
  const hasPosition = balance != null && balance > 0

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable onPress={handleBack} hitSlop={12}>
              <Ionicons name="chevron-back" size={spec.header.navIconSize} color={semanticColors.icon.primary} />
            </Pressable>
            <TokenHeaderImage imageUri={token.imageUri} symbol={token.symbol} />
            <View style={styles.headerNameCol}>
              <Text style={styles.headerName}>{token.name}</Text>
              <Text style={styles.headerSymbol}>{token.symbol}</Text>
            </View>
          </View>
          <Pressable style={styles.followButton}>
            <Text style={styles.followText}>Follow</Text>
          </Pressable>
        </View>

        {/* ── Price Info ── */}
        <View style={styles.priceSection}>
          <Text style={styles.priceText}>{formatPrice(token.priceUsd)}</Text>
          <View style={styles.changeRow}>
            <Text style={[styles.changeText, { color: positiveTrend ? spec.colors.positiveChange : spec.colors.negativeChange }]}>
              {formatAbsoluteChange(token.priceUsd, token.priceChange24h)}
            </Text>
            <Text style={[styles.changeText, { color: positiveTrend ? spec.colors.positiveChange : spec.colors.negativeChange }]}>
              ({formatPercent(token.priceChange24h)})
            </Text>
            <Text style={styles.periodText}>24h</Text>
          </View>
        </View>

        {/* ── Chart ── */}
        <TokenDetailChart
          points={chartPoints ?? []}
          positiveTrend={positiveTrend}
          loading={loading}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />

        {/* ── Position ── */}
        {hasPosition && (
          <SectionContainer title="Your Position">
            <View style={styles.positionCard}>
              <View style={styles.positionCol}>
                <Text style={styles.positionLabel}>Balance</Text>
                <Text style={styles.positionValue}>{balance} {token.symbol}</Text>
              </View>
              <View style={styles.positionColEnd}>
                <Text style={styles.positionLabel}>Value</Text>
                <Text style={styles.positionValue}>{balanceUsd != null ? formatCompact(balanceUsd) : '—'}</Text>
              </View>
            </View>
          </SectionContainer>
        )}

        {/* ── Info Card 1: Identity ── */}
        <SectionContainer title="Info">
          <View style={styles.infoCard}>
            <InfoRow label="Name" value={token.name} />
            <InfoRow label="Symbol" value={token.symbol} />
            <InfoRow label="Mint Address" value={truncateMint(token.mint)} mono />
            <InfoRow label="Market Cap" value={token.marketCap ? formatCompact(token.marketCap) : '—'} last />
          </View>

          {/* ── Info Card 2: Supply & Stats ── */}
          <View style={[styles.infoCard, { marginTop: spec.section.cardGap }]}>
            <InfoRow label="Total Supply" value="--" />
            <InfoRow label="Circulating Supply" value="--" />
            <InfoRow label="Holders" value="--" />
            <InfoRow label="Created" value="--" last />
          </View>
        </SectionContainer>

        {/* ── About ── */}
        {token.description ? (
          <SectionContainer title="About">
            <Text style={styles.aboutBody}>{token.description}</Text>
            <View style={styles.linkRow}>
              <LinkPill label="Website" icon="globe-outline" />
              <LinkPill label="X" icon="logo-twitter" />
            </View>
          </SectionContainer>
        ) : null}

        {/* ── 24h Performance ── */}
        <SectionContainer title="24h Performance">
          <PerformanceGrid volume24h={token.volume24h} />
        </SectionContainer>

        {/* ── Security ── */}
        <SectionContainer title="Security">
          <View style={styles.infoCard}>
            <SecurityRow label="Top 10 Holders" value="--" />
            <SecurityRow label="Mutable" value="--" />
            <SecurityRow label="Update Authority" value="--" last />
          </View>
        </SectionContainer>

        {/* ── Activity ── */}
        <SectionContainer title="Activity">
          {activity.length > 0 ? (
            <View style={styles.activityList}>
              {activity.map((event) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </View>
          ) : (
            <View style={styles.activityEmpty}>
              <Text style={styles.activityEmptyText}>No activity for this token yet</Text>
            </View>
          )}
        </SectionContainer>
      </ScrollView>

      {/* ── Sticky Actions ── */}
      <View style={styles.ctaBar}>
        {hasPosition && (
          <Pressable style={styles.sellButton} onPress={onSellPress}>
            <Text style={styles.sellButtonText}>Sell</Text>
          </Pressable>
        )}
        <Pressable style={[styles.buyButton, !hasPosition && styles.buyButtonFull]} onPress={onBuyPress}>
          <Text style={styles.buyButtonText}>Buy</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function SectionContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function TokenHeaderImage({ imageUri, symbol }: { imageUri?: string | null; symbol: string }) {
  const hasImage = typeof imageUri === 'string' && imageUri.length > 0

  if (hasImage) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={styles.headerImage}
        resizeMode="cover"
      />
    )
  }

  return (
    <View style={[styles.headerImage, styles.headerImageFallback]}>
      <Text style={styles.headerImageFallbackText}>{symbol.slice(0, 1).toUpperCase()}</Text>
    </View>
  )
}

function InfoRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={[styles.infoRowValue, mono && styles.infoRowMono]}>{value}</Text>
    </View>
  )
}

function SecurityRow({ label, value, status, last }: { label: string; value: string; status?: boolean; last?: boolean }) {
  const isGreen = status === true
  return (
    <View style={[styles.securityRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <View style={styles.securityValueRow}>
        {isGreen && <View style={styles.securityDot} />}
        <Text style={[styles.infoRowValue, isGreen && styles.securityValueGreen]}>{value}</Text>
      </View>
    </View>
  )
}

function ActivityRow({ event }: { event: TokenActivityEvent }) {
  const isBuy = event.type === 'buy'
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIconContainer, { backgroundColor: isBuy ? spec.colors.activityBuyBg : spec.colors.activitySellBg }]}>
        <Ionicons
          name={isBuy ? 'arrow-up-outline' : 'arrow-down-outline'}
          size={spec.activity.iconSize}
          color={isBuy ? spec.colors.activityBuyIcon : spec.colors.activitySellIcon}
        />
      </View>
      <View style={styles.activityContent}>
        <View style={styles.activityTopRow}>
          <Text style={styles.activityTitle}>{event.title}</Text>
          <Text style={styles.activityAmount}>{event.amount}</Text>
        </View>
        <View style={styles.activityBottomRow}>
          <Text style={styles.activityDate}>{event.date}</Text>
          <Text style={styles.activityValue}>{event.valueUsd}</Text>
        </View>
      </View>
    </View>
  )
}

function LinkPill({ label, icon, url }: { label: string; icon: string; url?: string | null }) {
  return (
    <Pressable style={styles.linkPill} onPress={() => url && void Linking.openURL(url)} disabled={!url}>
      <Ionicons name={icon as never} size={spec.about.linkIconSize} color={spec.colors.linkPillIcon} />
      <Text style={styles.linkPillText}>{label}</Text>
    </Pressable>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: spec.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spec.header.horizontalPadding,
    paddingTop: spec.header.topPadding,
    paddingBottom: spec.header.bottomPadding,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerImage: {
    width: spec.header.imageSize,
    height: spec.header.imageSize,
    borderRadius: spec.header.imageSize / 2,
  },
  headerImageFallback: {
    backgroundColor: semanticColors.app.backgroundPanelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerImageFallbackText: {
    fontFamily: interFontFamily.bold,
    fontSize: 14,
    color: semanticColors.text.primary,
  },
  headerNameCol: {
    gap: spec.header.nameGap,
  },
  headerName: {
    fontFamily: spaceGroteskFamily.bold,
    fontSize: spec.header.nameFontSize,
    lineHeight: spec.header.nameLineHeight,
    color: spec.colors.headerText,
  },
  headerSymbol: {
    fontFamily: interFontFamily.regular,
    fontSize: spec.header.symbolFontSize,
    lineHeight: spec.header.symbolLineHeight,
    color: spec.colors.secondaryText,
  },
  followButton: {
    paddingVertical: spec.header.followPaddingVertical,
    paddingHorizontal: spec.header.followPaddingHorizontal,
    borderRadius: 999,
    backgroundColor: spec.colors.followBackground,
    borderWidth: 1,
    borderColor: spec.colors.followBorder,
  },
  followText: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.header.followFontSize,
    lineHeight: spec.header.followLineHeight,
    color: spec.colors.followText,
  },

  // Price
  priceSection: {
    paddingHorizontal: spec.price.horizontalPadding,
    paddingTop: spec.price.topPadding,
    gap: 4,
  },
  priceText: {
    fontFamily: spaceGroteskFamily.bold,
    fontSize: spec.price.fontSize,
    lineHeight: spec.price.lineHeight,
    letterSpacing: spec.price.letterSpacing,
    color: spec.colors.priceText,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spec.price.changeGap,
  },
  changeText: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.price.changeFontSize,
    lineHeight: spec.price.changeLineHeight,
  },
  periodText: {
    fontFamily: interFontFamily.regular,
    fontSize: spec.price.periodFontSize,
    lineHeight: spec.price.periodLineHeight,
    color: spec.colors.secondaryText,
  },

  // Sections
  section: {
    paddingHorizontal: spec.section.horizontalPadding,
    paddingTop: spec.section.topPadding,
    gap: spec.section.titleGap,
  },
  sectionTitle: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.section.titleFontSize,
    lineHeight: spec.section.titleLineHeight,
    letterSpacing: spec.section.titleLetterSpacing,
    color: spec.colors.sectionTitle,
    textTransform: 'uppercase',
  },

  // Position
  positionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spec.position.cardPadding,
    borderRadius: spec.position.cardRadius,
    backgroundColor: spec.colors.cardBackground,
  },
  positionCol: {
    gap: spec.position.valueGap,
  },
  positionColEnd: {
    alignItems: 'flex-end',
    gap: spec.position.valueGap,
  },
  positionLabel: {
    fontSize: spec.position.labelFontSize,
    lineHeight: spec.position.labelLineHeight,
    color: spec.colors.metricLabel,
  },
  positionValue: {
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: spec.position.valueFontSize,
    lineHeight: spec.position.valueLineHeight,
    color: spec.colors.metricValue,
  },

  // Info card
  infoCard: {
    borderRadius: spec.infoRow.cardRadius,
    backgroundColor: spec.colors.cardBackground,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spec.infoRow.paddingVertical,
    paddingHorizontal: spec.infoRow.paddingHorizontal,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: spec.colors.cardDivider,
  },
  infoRowLabel: {
    fontSize: spec.infoRow.labelFontSize,
    lineHeight: spec.infoRow.labelLineHeight,
    color: spec.colors.rowLabel,
  },
  infoRowValue: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.infoRow.valueFontSize,
    lineHeight: spec.infoRow.valueLineHeight,
    color: spec.colors.rowValue,
  },
  infoRowMono: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.infoRow.mintFontSize,
  },

  // Security
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spec.security.rowPaddingVertical,
    paddingHorizontal: spec.security.rowPaddingHorizontal,
  },
  securityValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spec.security.dotGap,
  },
  securityDot: {
    width: spec.security.dotSize,
    height: spec.security.dotSize,
    borderRadius: spec.security.dotSize / 2,
    backgroundColor: spec.colors.statusGreen,
  },
  securityValueGreen: {
    color: spec.colors.statusGreen,
  },

  // About
  aboutBody: {
    fontSize: spec.about.bodyFontSize,
    lineHeight: spec.about.bodyLineHeight,
    color: spec.colors.bodyText,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spec.about.linkGap,
    paddingTop: spec.about.linkTopPadding,
  },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spec.about.linkIconGap,
    paddingVertical: spec.about.linkPillPaddingVertical,
    paddingHorizontal: spec.about.linkPillPaddingHorizontal,
    borderRadius: spec.about.linkPillRadius,
    backgroundColor: spec.colors.linkPillBackground,
  },
  linkPillText: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.about.linkFontSize,
    lineHeight: spec.about.linkLineHeight,
    color: spec.colors.linkPillText,
  },

  // Activity
  activityList: {
    gap: spec.activity.rowGap,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spec.activity.rowPadding,
    borderRadius: spec.activity.rowRadius,
    backgroundColor: spec.colors.cardBackground,
    gap: 12,
  },
  activityIconContainer: {
    width: spec.activity.iconContainerSize,
    height: spec.activity.iconContainerSize,
    borderRadius: spec.activity.iconContainerSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
  activityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.activity.labelFontSize,
    lineHeight: spec.activity.labelLineHeight,
    color: spec.colors.rowValue,
  },
  activityDate: {
    fontSize: spec.activity.dateFontSize,
    lineHeight: spec.activity.dateLineHeight,
    color: spec.colors.secondaryText,
  },
  activityAmount: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.activity.amountFontSize,
    lineHeight: spec.activity.amountLineHeight,
    color: spec.colors.rowValue,
  },
  activityValue: {
    fontSize: spec.activity.valueFontSize,
    lineHeight: spec.activity.valueLineHeight,
    color: spec.colors.secondaryText,
  },
  activityEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  activityEmptyText: {
    fontSize: 13,
    color: spec.colors.secondaryText,
  },

  // CTA
  ctaBar: {
    flexDirection: 'row',
    gap: spec.cta.gap,
    paddingHorizontal: spec.cta.horizontalPadding,
    paddingTop: spec.cta.topPadding,
    paddingBottom: spec.cta.bottomPadding,
    borderTopWidth: 1,
    borderTopColor: spec.colors.ctaBorder,
  },
  sellButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: spec.cta.buttonHeight,
    borderRadius: spec.cta.buttonRadius,
    backgroundColor: spec.colors.sellBackground,
  },
  sellButtonText: {
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: spec.cta.fontSize,
    lineHeight: spec.cta.lineHeight,
    color: spec.colors.sellText,
  },
  buyButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: spec.cta.buttonHeight,
    borderRadius: spec.cta.buttonRadius,
    backgroundColor: spec.colors.buyBackground,
  },
  buyButtonFull: {
    flex: 2,
  },
  buyButtonText: {
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: spec.cta.fontSize,
    lineHeight: spec.cta.lineHeight,
    color: spec.colors.buyText,
  },
})
