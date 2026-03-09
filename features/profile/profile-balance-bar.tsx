import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { getChangeArrow, getChangeColor } from '@/features/profile/change-indicator'
import { formatUsd } from '@/features/profile/format'
import { interFontFamily, spaceGroteskFamily } from '@/constants/typography'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

const spec = profileDesignSpec

export function ProfileBalanceBar({ totalBalance, changePercent }: { totalBalance: number; changePercent: number }) {
  const changeColor = getChangeColor(changePercent)
  const arrow = getChangeArrow(changePercent)

  return (
    <View style={styles.container}>
      <Text style={styles.balance}>{formatUsd(totalBalance)}</Text>
      <View style={styles.changeRow}>
        <Text style={[styles.changeText, { color: changeColor }]}>
          {arrow} {Math.abs(changePercent).toFixed(2)}%
        </Text>
        <Text style={styles.period}>24h</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  balance: {
    color: spec.colors.primaryText,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: spec.balance.fontSize,
    letterSpacing: spec.balance.letterSpacing,
    lineHeight: spec.balance.lineHeight,
  },
  changeRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spec.balance.changeGap,
  },
  changeText: {
    fontFamily: interFontFamily.bold,
    fontSize: spec.balance.changeFontSize,
    lineHeight: spec.balance.changeLineHeight,
  },
  container: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spec.balance.bottomPadding,
    paddingHorizontal: spec.balance.horizontalPadding,
    paddingTop: spec.balance.topPadding,
  },
  period: {
    color: spec.colors.secondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: spec.balance.periodFontSize,
    lineHeight: spec.balance.periodLineHeight,
  },
})
