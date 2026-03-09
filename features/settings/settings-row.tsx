import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsToggle } from '@/features/settings/settings-toggle'
import { SettingsRowConfig } from '@/features/settings/types'
import { interFontFamily } from '@/constants/typography'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

export function SettingsRow({ row }: { row: SettingsRowConfig }) {
  const height = row.isDanger || row.isMuted ? spec.row.dangerHeight : spec.row.height
  const hasSubtitle = !!row.subtitle && !row.isDanger && !row.isMuted

  const titleColor = row.isDanger ? spec.colors.dangerText : row.isMuted ? spec.colors.mutedText : spec.colors.rowTitle

  return (
    <Pressable
      accessibilityLabel={row.title}
      accessibilityRole="button"
      onPress={row.accessory === 'toggle' ? undefined : row.onPress}
      style={({ pressed }) => [styles.container, { height }, pressed && row.onPress ? styles.pressed : null]}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={row.icon} size={spec.row.iconSize} color={titleColor} />
      </View>

      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: titleColor }]}>{row.title}</Text>
        {hasSubtitle ? (
          <View style={styles.subtitleRow}>
            {row.trailingDotColor ? (
              <View style={[styles.statusDot, { backgroundColor: row.trailingDotColor }]} />
            ) : null}
            <Text style={styles.subtitle} numberOfLines={1}>
              {row.subtitle}
            </Text>
          </View>
        ) : null}
      </View>

      {row.accessory === 'chevron' ? (
        <Ionicons name="chevron-forward" size={20} color={spec.colors.rowSubtitle} />
      ) : null}

      {row.accessory === 'toggle' && row.onToggle ? (
        <SettingsToggle value={!!row.toggleValue} onValueChange={row.onToggle} />
      ) : null}

      {row.accessory === 'external-link' ? (
        <Ionicons name="open-outline" size={20} color={spec.colors.externalLinkIcon} />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spec.row.gap,
    paddingLeft: spec.row.paddingLeft,
    paddingRight: spec.row.paddingRight,
  },
  iconContainer: {
    alignItems: 'center',
    height: spec.row.iconSize,
    justifyContent: 'center',
    width: spec.row.iconSize,
  },
  pressed: {
    opacity: 0.7,
  },
  statusDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  subtitle: {
    color: spec.colors.rowSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.row.subtitleFontSize,
    lineHeight: spec.row.subtitleLineHeight,
  },
  subtitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: interFontFamily.regular,
    fontSize: spec.row.titleFontSize,
    lineHeight: spec.row.titleLineHeight,
  },
})
