import { TokenFeedItem } from '@/features/feed/types'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'

interface TokenCardProps {
  item: TokenFeedItem
  availableHeight: number
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1 ? 2 : 6,
  }).format(value)
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function TokenCard({ item, availableHeight }: TokenCardProps) {
  const { width } = useWindowDimensions()
  const priceChangePositive = item.priceChange24h >= 0
  const cardPadding = clamp(width * 0.05, 16, 24)
  const topSectionGap = clamp(availableHeight * 0.035, 14, 34)
  const metricGap = clamp(availableHeight * 0.014, 10, 16)
  const badgeFontSize = clamp(width * 0.03, 11, 13)
  const badgeHorizontalPadding = clamp(width * 0.025, 9, 12)
  const badgeVerticalPadding = clamp(cardPadding * 0.22, 4, 6)
  const symbolSize = clamp(width * 0.09, 30, 42)
  const nameSize = clamp(width * 0.047, 16, 20)
  const priceSize = clamp(width * 0.115, 34, 48)
  const changeSize = clamp(width * 0.085, 22, 34)
  const metricLabelSize = clamp(width * 0.038, 13, 16)
  const metricValueSize = clamp(width * 0.08, 20, 30)
  const metricHorizontalPadding = clamp(cardPadding * 0.72, 12, 18)
  const metricVerticalPadding = clamp(cardPadding * 0.62, 10, 14)

  return (
    <View style={[styles.card, { padding: cardPadding }]}>
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.symbol, { fontSize: symbolSize }]}>{item.symbol}</Text>
          <Text style={[styles.name, { fontSize: nameSize }]}>{item.name}</Text>
        </View>
        <View style={[styles.badgeRow, { gap: metricGap }]}>
          <Text
            style={[
              styles.badge,
              styles.categoryBadge,
              {
                fontSize: badgeFontSize,
                paddingHorizontal: badgeHorizontalPadding,
                paddingVertical: badgeVerticalPadding,
              },
            ]}
          >
            {item.category}
          </Text>
          <Text
            style={[
              styles.badge,
              riskStyles[item.riskTier],
              {
                fontSize: badgeFontSize,
                paddingHorizontal: badgeHorizontalPadding,
                paddingVertical: badgeVerticalPadding,
              },
            ]}
          >
            {item.riskTier}
          </Text>
        </View>
      </View>

      <View style={[styles.priceRow, { marginTop: topSectionGap, gap: metricGap * 0.6 }]}>
        <Text style={[styles.price, { fontSize: priceSize }]}>{formatUsd(item.priceUsd)}</Text>
        <Text style={[styles.change, { fontSize: changeSize }, priceChangePositive ? styles.changeUp : styles.changeDown]}>
          {formatPercent(item.priceChange24h)}
        </Text>
      </View>

      <View style={[styles.metricGrid, { gap: metricGap, marginTop: 'auto' }]}>
        <View style={[styles.metricItem, { paddingHorizontal: metricHorizontalPadding, paddingVertical: metricVerticalPadding }]}>
          <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>24h Volume</Text>
          <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatUsd(item.volume24h)}</Text>
        </View>
        <View style={[styles.metricItem, { paddingHorizontal: metricHorizontalPadding, paddingVertical: metricVerticalPadding }]}>
          <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>Liquidity</Text>
          <Text style={[styles.metricValue, { fontSize: metricValueSize }]}>{formatUsd(item.liquidity)}</Text>
        </View>
      </View>
    </View>
  )
}

const riskStyles = StyleSheet.create({
  allow: {
    backgroundColor: '#163f2a',
    color: '#8ef3b1',
  },
  block: {
    backgroundColor: '#4a1313',
    color: '#ff9a9a',
  },
  warn: {
    backgroundColor: '#4a3e12',
    color: '#ffd476',
  },
})

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    fontWeight: '700',
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  badgeRow: {
    alignItems: 'flex-end',
  },
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#233150',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: '#1e293b',
    color: '#d6deed',
  },
  change: {
    fontWeight: '700',
  },
  changeDown: {
    color: '#ff9a9a',
  },
  changeUp: {
    color: '#8ef3b1',
  },
  metricGrid: {
  },
  metricItem: {
    backgroundColor: '#111c33',
    borderRadius: 14,
  },
  metricLabel: {
    color: '#8fa6cc',
    marginBottom: 4,
  },
  metricValue: {
    color: '#f5f8ff',
    fontWeight: '700',
  },
  name: {
    color: '#8fa6cc',
    marginTop: 4,
  },
  price: {
    color: '#f5f8ff',
    fontWeight: '700',
  },
  priceRow: {
  },
  symbol: {
    color: '#f5f8ff',
    fontWeight: '800',
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
