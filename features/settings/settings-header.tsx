import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { interFontFamily } from '@/constants/typography'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

export function SettingsHeader({ title = 'Settings' }: { title?: string }) {
  const router = useRouter()

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={spec.colors.headerBackIcon} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: spec.header.backButtonSize,
    justifyContent: 'center',
    width: spec.header.backButtonSize,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spec.header.horizontalPadding,
    paddingTop: spec.header.paddingTop,
    paddingBottom: spec.header.paddingBottom,
  },
  title: {
    color: spec.colors.headerTitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.header.titleFontSize,
    lineHeight: spec.header.titleLineHeight,
  },
})
