import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { getChangeArrow, getChangeColor } from '@/features/profile/change-indicator'
import { TokenIcon } from '@/features/profile/token-icon'
import type { WatchlistItem } from '@/features/profile/types'
import { interFontFamily } from '@/constants/typography'
import React, { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const spec = profileDesignSpec

export function ProfileWatchlistCard({
  item,
  onUnfollow,
}: {
  item: WatchlistItem
  onUnfollow: (mint: string) => void
}) {
  const changeColor = getChangeColor(item.changePercent)
  const arrow = getChangeArrow(item.changePercent)
  const sign = item.changePercent > 0 ? '+' : ''

  const handleUnfollow = useCallback(() => {
    onUnfollow(item.mint)
  }, [item.mint, onUnfollow])

  return (
    <View style={styles.card}>
      <TokenIcon color={item.iconColor} colorEnd={item.iconColorEnd} symbol={item.symbol} />
      <View style={styles.nameColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.changeRow}>
          <Text style={[styles.changeText, { color: changeColor }]}>
            {arrow} {sign}
            {Math.abs(item.changePercent).toFixed(2)}%
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Unfollow ${item.name}`}
        accessibilityRole="button"
        onPress={handleUnfollow}
        style={({ pressed }) => [styles.unfollowButton, pressed && styles.unfollowPressed]}
      >
        <Text style={styles.unfollowText}>Unfollow</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: spec.colors.cardBackground,
    borderRadius: spec.card.borderRadius,
    flexDirection: 'row',
    gap: spec.card.gap,
    paddingHorizontal: spec.card.padding,
    paddingVertical: spec.watchlistCard.padding,
  },
  changeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spec.watchlistCard.changeGap,
  },
  changeText: {
    fontFamily: interFontFamily.medium,
    fontSize: spec.card.changeFontSize,
    lineHeight: spec.card.changeLineHeight,
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
  unfollowButton: {
    alignItems: 'center',
    backgroundColor: spec.colors.unfollowBackground,
    borderRadius: spec.watchlistCard.unfollowRadius,
    flexShrink: 0,
    paddingHorizontal: spec.watchlistCard.unfollowPaddingHorizontal,
    paddingVertical: spec.watchlistCard.unfollowPaddingVertical,
  },
  unfollowPressed: {
    opacity: 0.7,
  },
  unfollowText: {
    color: spec.colors.unfollowText,
    fontFamily: interFontFamily.medium,
    fontSize: spec.watchlistCard.unfollowFontSize,
    lineHeight: spec.watchlistCard.unfollowLineHeight,
  },
})
