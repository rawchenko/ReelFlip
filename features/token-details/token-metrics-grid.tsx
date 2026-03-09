import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { spaceGroteskFamily } from '@/constants/typography'
import { tokenDetailsDesignSpec as spec } from '@/features/token-details/token-details-design-spec'

interface PerformanceGridProps {
  volume24h: number
  traders24h?: number | null
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

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return String(value)
}

export function PerformanceGrid({ volume24h, traders24h }: PerformanceGridProps) {
  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <Text style={styles.label}>Volume</Text>
        <Text style={styles.value}>{formatCompact(volume24h)}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Traders</Text>
        <Text style={styles.value}>{traders24h != null ? formatCount(traders24h) : '—'}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spec.performance.gridGap,
  },
  card: {
    flex: 1,
    backgroundColor: spec.colors.cardBackground,
    borderRadius: spec.performance.cardRadius,
    padding: spec.performance.cardPadding,
    gap: spec.performance.valueGap,
  },
  label: {
    fontSize: spec.performance.labelFontSize,
    lineHeight: spec.performance.labelLineHeight,
    color: spec.colors.metricLabel,
  },
  value: {
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: spec.performance.valueFontSize,
    lineHeight: spec.performance.valueLineHeight,
    color: spec.colors.metricValue,
  },
})
