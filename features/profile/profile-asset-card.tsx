import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { getChangeColor } from '@/features/profile/change-indicator'
import { formatChange, formatUsd } from '@/features/profile/format'
import { TokenIcon } from '@/features/profile/token-icon'
import type { PortfolioAsset } from '@/features/profile/types'
import { interFontFamily } from '@/constants/typography'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

const spec = profileDesignSpec

export function ProfileAssetCard({ asset }: { asset: PortfolioAsset }) {
  const changeColor = getChangeColor(asset.changePercent)

  return (
    <View style={styles.card}>
      <TokenIcon color={asset.iconColor} colorEnd={asset.iconColorEnd} symbol={asset.symbol} />
      <View style={styles.nameColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {asset.name}
        </Text>
        <Text style={styles.amount} numberOfLines={1}>
          {asset.balanceFormatted}
        </Text>
      </View>
      <View style={styles.valueColumn}>
        <Text style={styles.value} numberOfLines={1}>
          {formatUsd(asset.usdValue)}
        </Text>
        <Text style={[styles.change, { color: changeColor }]} numberOfLines={1}>
          {formatChange(asset.usdChange, asset.changePercent)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  amount: {
    color: spec.colors.secondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: spec.card.amountFontSize,
    lineHeight: spec.card.amountLineHeight,
  },
  card: {
    alignItems: 'center',
    backgroundColor: spec.colors.cardBackground,
    borderRadius: spec.card.borderRadius,
    flexDirection: 'row',
    gap: spec.card.gap,
    paddingHorizontal: spec.card.padding,
    paddingVertical: spec.card.padding,
  },
  change: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.card.changeFontSize,
    lineHeight: spec.card.changeLineHeight,
    textAlign: 'right',
  },
  name: {
    color: spec.colors.primaryText,
    fontFamily: interFontFamily.bold,
    fontSize: spec.card.nameFontSize,
    lineHeight: spec.card.nameLineHeight,
  },
  nameColumn: {
    flex: 1,
    gap: spec.card.innerGap,
  },
  value: {
    color: spec.colors.primaryText,
    fontFamily: interFontFamily.bold,
    fontSize: spec.card.valueFontSize,
    lineHeight: spec.card.valueLineHeight,
    textAlign: 'right',
  },
  valueColumn: {
    alignItems: 'flex-end',
    gap: spec.card.innerGap,
  },
})
