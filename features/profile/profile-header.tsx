import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { interFontFamily } from '@/constants/typography'
import { radii } from '@/constants/spacing'
import { ellipsify } from '@/utils/ellipsify'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

const spec = profileDesignSpec

const GRADIENT_START = { x: 0, y: 0 } as const
const GRADIENT_END = { x: 1, y: 1 } as const

export function ProfileHeader({ address }: { address: string }) {
  const router = useRouter()

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <LinearGradient
          colors={[spec.colors.avatarGradientStart, spec.colors.avatarGradientEnd]}
          start={GRADIENT_START}
          end={GRADIENT_END}
          style={styles.avatar}
        />
        <Text style={styles.address}>{ellipsify(address, 4, '...')}</Text>
      </View>
      <Pressable
        accessibilityLabel="Settings"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push('/settings')}
        style={styles.settingsButton}
      >
        <Ionicons name="settings-outline" size={spec.header.settingsIconSize} color={spec.colors.secondaryText} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  address: {
    color: spec.colors.primaryText,
    fontFamily: interFontFamily.bold,
    fontSize: spec.header.addressFontSize,
    letterSpacing: spec.header.addressLetterSpacing,
    lineHeight: spec.header.addressLineHeight,
  },
  avatar: {
    borderRadius: radii.full,
    height: spec.header.avatarSize,
    width: spec.header.avatarSize,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spec.header.bottomPadding,
    paddingHorizontal: spec.header.horizontalPadding,
  },
  left: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spec.header.avatarGap,
  },
  settingsButton: {
    alignItems: 'center',
    height: spec.header.settingsTouchSize,
    justifyContent: 'center',
    width: spec.header.settingsTouchSize,
  },
})
