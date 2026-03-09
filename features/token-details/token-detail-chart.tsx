import React, { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import { spaceGroteskFamily } from '@/constants/typography'
import { MiniChart } from '@/features/feed/mini-chart'
import { tokenDetailsDesignSpec as spec } from '@/features/token-details/token-details-design-spec'
import type { ChartTimeRange } from '@/features/token-details/types'

const TIME_RANGES: ChartTimeRange[] = ['1H', '1D', '1W', '1M', 'YTD', 'ALL']

interface TokenDetailChartProps {
  points: number[]
  positiveTrend: boolean
  loading: boolean
  timeRange: ChartTimeRange
  onTimeRangeChange: (range: ChartTimeRange) => void
}

export function TokenDetailChart({
  points,
  positiveTrend,
  loading,
  timeRange,
  onTimeRangeChange,
}: TokenDetailChartProps) {
  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <MiniChart
          points={points.length > 0 ? points : undefined}
          positiveTrend={positiveTrend}
          height={spec.chart.height}
          fullBleed
        />
      </View>
      <TimeRangeSelector activeRange={timeRange} onSelect={onTimeRangeChange} />
    </View>
  )
}

interface TimeRangeSelectorProps {
  activeRange: ChartTimeRange
  onSelect: (range: ChartTimeRange) => void
}

function TimeRangeSelector({ activeRange, onSelect }: TimeRangeSelectorProps) {
  return (
    <View style={styles.selectorRow}>
      {TIME_RANGES.map((range) => (
        <TimeRangePill key={range} range={range} active={activeRange === range} onPress={onSelect} />
      ))}
    </View>
  )
}

interface TimeRangePillProps {
  range: ChartTimeRange
  active: boolean
  onPress: (range: ChartTimeRange) => void
}

function TimeRangePill({ range, active, onPress }: TimeRangePillProps) {
  const handlePress = useCallback(() => {
    onPress(range)
  }, [onPress, range])

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? spec.colors.timeRangeActiveText : spec.colors.timeRangeInactiveText },
        ]}
      >
        {range}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spec.chart.topPadding,
  },
  chartWrapper: {
    height: spec.chart.height,
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spec.timeRange.gap,
    paddingHorizontal: spec.timeRange.horizontalPadding,
  },
  pill: {
    paddingVertical: spec.timeRange.pillPaddingVertical,
    paddingHorizontal: spec.timeRange.pillPaddingHorizontal,
    borderRadius: spec.timeRange.pillRadius,
  },
  pillActive: {
    backgroundColor: spec.colors.timeRangeActive,
  },
  pillInactive: {
    backgroundColor: spec.colors.timeRangeInactive,
  },
  pillText: {
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: spec.timeRange.fontSize,
    lineHeight: spec.timeRange.lineHeight,
  },
})
