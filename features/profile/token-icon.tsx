import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { interFontFamily } from '@/constants/typography'
import { radii } from '@/constants/spacing'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

const spec = profileDesignSpec

const GRADIENT_START = { x: 0, y: 0 } as const
const GRADIENT_END = { x: 1, y: 1 } as const

export function TokenIcon({
  color,
  colorEnd,
  symbol,
}: {
  color: string
  colorEnd?: string
  /** When provided, shows the first character as a text fallback inside solid-color icons */
  symbol?: string
}) {
  if (colorEnd) {
    return <LinearGradient colors={[color, colorEnd]} start={GRADIENT_START} end={GRADIENT_END} style={styles.icon} />
  }

  return (
    <View style={[styles.icon, { backgroundColor: color }]}>
      {symbol ? <Text style={styles.iconText}>{symbol.charAt(0)}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  icon: {
    alignItems: 'center',
    borderRadius: radii.full,
    flexShrink: 0,
    height: spec.card.iconSize,
    justifyContent: 'center',
    width: spec.card.iconSize,
  },
  iconText: {
    color: spec.colors.primaryText,
    fontFamily: interFontFamily.bold,
    fontSize: 16,
  },
})
