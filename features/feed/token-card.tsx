import { MiniChart } from '@/features/feed/mini-chart'
import { TokenFeedItem } from '@/features/feed/types'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value)
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function TokenCard({ item, availableHeight }: TokenCardProps) {
  const { width } = useWindowDimensions()
  const isUp = item.priceChange24h >= 0
  const cardPadding = clamp(width * 0.055, 18, 26)
  const symbolSize = clamp(width * 0.12, 44, 60)
  const nameSize = clamp(width * 0.06, 19, 23)
  const badgeFontSize = clamp(width * 0.03, 11, 13)
  const priceSize = clamp(width * 0.145, 48, 68)
  const changeSize = clamp(width * 0.083, 24, 34)
  const metricLabelSize = clamp(width * 0.028, 10, 12)
  const metricValueSize = clamp(width * 0.047, 16, 20)
  const chartHeight = Math.max(availableHeight - 6, 320)

  return (
    <View style={styles.card}>
      <MiniChart
        points={item.sparkline}
        positiveTrend={isUp}
        fullBleed
        height={chartHeight}
        candleCount={32}
        showAxis={false}
        showPriceBubble={false}
      />

      <LinearGradient
        colors={['rgba(10, 11, 16, 0.9)', 'rgba(10, 11, 16, 0)']}
        style={styles.topShade}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(10, 11, 16, 0)', 'rgba(10, 11, 16, 0.8)', '#0A0B10']}
        locations={[0, 0.5, 1]}
        style={styles.bottomShade}
        pointerEvents="none"
      />

      <View style={[styles.topOverlay, { paddingTop: cardPadding, paddingHorizontal: cardPadding }]}>
        <View>
          <Text style={[styles.symbol, { fontSize: symbolSize }]}>{item.symbol}</Text>
          <Text style={[styles.name, { fontSize: nameSize }]}>{item.name}</Text>
        </View>
        <View style={styles.badgeColumn}>
          <Text style={[styles.badge, styles.categoryBadge, { fontSize: badgeFontSize }]}>{item.category}</Text>
          <Text style={[styles.badge, riskStyles[item.riskTier], { fontSize: badgeFontSize }]}>{item.riskTier}</Text>
        </View>
      </View>

      <View style={[styles.bottomOverlay, { paddingHorizontal: cardPadding, paddingBottom: cardPadding + 6 }]}>
        <Text style={[styles.price, { fontSize: priceSize }]}>{formatUsd(item.priceUsd)}</Text>
        <Text style={[styles.change, { fontSize: changeSize }, isUp ? styles.changeUp : styles.changeDown]}>
          {formatPercent(item.priceChange24h)}
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricChip}>
            <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>24H VOL</Text>
            <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatCompactUsd(item.volume24h)}</Text>
          </View>
          <View style={styles.metricChip}>
            <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>LIQUIDITY</Text>
            <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatCompactUsd(item.liquidity)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

const riskStyles = StyleSheet.create({
  allow: {
    backgroundColor: '#14532D',
    color: '#86EFAC',
  },
  block: {
    backgroundColor: '#451A1A',
    color: '#FCA5A5',
  },
  warn: {
    backgroundColor: '#422006',
    color: '#FDBA74',
  },
})

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  bottomShade: {
    bottom: 0,
    height: '48%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  card: {
    backgroundColor: '#0A0B10',
    borderColor: '#1C1D24',
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  categoryBadge: {
    backgroundColor: '#1E293B',
    color: '#93C5FD',
  },
  change: {
    fontWeight: '800',
    marginTop: 6,
  },
  changeDown: {
    color: '#F87171',
  },
  changeUp: {
    color: '#4ADE80',
  },
  metricChip: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricLabel: {
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 6,
  },
  metricValue: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  name: {
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },
  price: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  symbol: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  topOverlay: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topShade: {
    height: '34%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
})
