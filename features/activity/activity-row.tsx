import { activityDesignSpec } from '@/features/activity/activity-design-spec'
import { ActivityLeg, ActivityEvent } from '@/features/activity/types'
import { interFontFamily } from '@/constants/typography'
import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

interface ActivityRowProps {
  item: ActivityEvent
}

function legInitial(leg: ActivityLeg): string {
  if (leg.symbol.length === 0) {
    return '?'
  }

  return leg.symbol.slice(0, 1).toUpperCase()
}

function ActivityBadge({ leg, shifted = false }: { leg: ActivityLeg; shifted?: boolean }) {
  if (leg.iconUri) {
    return <Image source={{ uri: leg.iconUri }} style={[styles.badge, shifted ? styles.badgeShifted : null]} />
  }

  return (
    <View style={[styles.badge, styles.badgeFallback, shifted ? styles.badgeShifted : null]}>
      <Text style={styles.badgeText}>{legInitial(leg)}</Text>
    </View>
  )
}

export function ActivityRow({ item }: ActivityRowProps) {
  const isTransfer = item.type === 'transfer'

  return (
    <View style={styles.container}>
      <View style={styles.badgesWrap}>
        {isTransfer ? (
          <ActivityBadge leg={item.receivedLeg} />
        ) : (
          <>
            <ActivityBadge leg={item.sentLeg ?? item.receivedLeg} />
            <ActivityBadge leg={item.receivedLeg} shifted />
          </>
        )}
      </View>

      <View style={styles.mainCopy}>
        <Text style={styles.primaryText} numberOfLines={1}>
          {item.primaryText}
        </Text>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {item.secondaryText}
        </Text>
      </View>

      <View style={styles.amountsWrap}>
        <Text
          style={item.receivedLeg.direction === 'receive' ? styles.receivedAmount : styles.sentAmount}
          numberOfLines={1}
        >
          {item.receivedLeg.amountDisplay}
        </Text>
        {!isTransfer && item.sentLeg && (
          <Text style={styles.sentAmount} numberOfLines={1}>
            {item.sentLeg.amountDisplay}
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  amountsWrap: {
    alignItems: 'flex-end',
    flexShrink: 0,
    justifyContent: 'center',
  },
  badge: {
    borderColor: activityDesignSpec.colors.badgeBackground,
    borderRadius: activityDesignSpec.row.badgeSize / 2,
    borderWidth: 2,
    height: activityDesignSpec.row.badgeSize,
    width: activityDesignSpec.row.badgeSize,
  },
  badgeFallback: {
    alignItems: 'center',
    backgroundColor: activityDesignSpec.colors.badgeBackground,
    justifyContent: 'center',
  },
  badgeShifted: {
    left: activityDesignSpec.row.badgeOverlapOffset,
    position: 'absolute',
    top: activityDesignSpec.row.badgeOverlapOffset,
  },
  badgeText: {
    color: activityDesignSpec.colors.primaryText,
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  badgesWrap: {
    height: activityDesignSpec.row.iconContainerSize,
    width: activityDesignSpec.row.iconContainerSize,
  },
  container: {
    alignItems: 'center',
    backgroundColor: activityDesignSpec.colors.rowBackground,
    borderRadius: activityDesignSpec.row.borderRadius,
    flexDirection: 'row',
    gap: activityDesignSpec.row.contentGap,
    height: activityDesignSpec.row.height,
    paddingHorizontal: activityDesignSpec.row.horizontalPadding,
  },
  mainCopy: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  primaryText: {
    color: activityDesignSpec.colors.primaryText,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  receivedAmount: {
    color: activityDesignSpec.colors.receivedAmount,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'right',
  },
  secondaryText: {
    color: activityDesignSpec.colors.secondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  sentAmount: {
    color: activityDesignSpec.colors.secondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
})
