import { TokenFeedItem } from '@/features/feed/types'
import { StyleSheet, Text, View } from 'react-native'

interface TokenCardProps {
  item: TokenFeedItem
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

export function TokenCard({ item }: TokenCardProps) {
  const priceChangePositive = item.priceChange24h >= 0

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <View style={styles.badgeRow}>
          <Text style={[styles.badge, styles.categoryBadge]}>{item.category}</Text>
          <Text style={[styles.badge, riskStyles[item.riskTier]]}>{item.riskTier}</Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatUsd(item.priceUsd)}</Text>
        <Text style={[styles.change, priceChangePositive ? styles.changeUp : styles.changeDown]}>
          {formatPercent(item.priceChange24h)}
        </Text>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>24h Volume</Text>
          <Text style={styles.metricValue}>{formatUsd(item.volume24h)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>Liquidity</Text>
          <Text style={styles.metricValue}>{formatUsd(item.liquidity)}</Text>
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
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  badgeRow: {
    alignItems: 'flex-end',
    gap: 8,
  },
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#233150',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  categoryBadge: {
    backgroundColor: '#1e293b',
    color: '#d6deed',
  },
  change: {
    fontSize: 22,
    fontWeight: '700',
  },
  changeDown: {
    color: '#ff9a9a',
  },
  changeUp: {
    color: '#8ef3b1',
  },
  metricGrid: {
    gap: 12,
  },
  metricItem: {
    backgroundColor: '#111c33',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricLabel: {
    color: '#8fa6cc',
    fontSize: 13,
    marginBottom: 4,
  },
  metricValue: {
    color: '#f5f8ff',
    fontSize: 20,
    fontWeight: '700',
  },
  name: {
    color: '#8fa6cc',
    fontSize: 16,
    marginTop: 4,
  },
  price: {
    color: '#f5f8ff',
    fontSize: 38,
    fontWeight: '700',
  },
  priceRow: {
    gap: 6,
  },
  symbol: {
    color: '#f5f8ff',
    fontSize: 32,
    fontWeight: '800',
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
