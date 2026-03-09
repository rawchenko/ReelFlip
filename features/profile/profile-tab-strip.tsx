import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import type { ProfileTab } from '@/features/profile/types'
import { interFontFamily } from '@/constants/typography'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const spec = profileDesignSpec

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'assets', label: 'ASSETS' },
  { key: 'watchlist', label: 'WATCHLIST' },
]

export function ProfileTabStrip({
  activeTab,
  onTabChange,
}: {
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
}) {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => (
        <Pressable
          key={tab.key}
          accessibilityLabel={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.key }}
          onPress={() => onTabChange(tab.key)}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : styles.tabTextInactive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: spec.colors.tabBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spec.tabs.sectionHorizontalPadding,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spec.tabs.paddingHorizontal,
    paddingVertical: spec.tabs.paddingVertical,
  },
  tabActive: {
    borderBottomColor: spec.colors.activeTabUnderline,
    borderBottomWidth: spec.tabs.underlineHeight,
  },
  tabText: {
    fontSize: spec.tabs.fontSize,
    letterSpacing: spec.tabs.letterSpacing,
    lineHeight: spec.tabs.lineHeight,
  },
  tabTextActive: {
    color: spec.colors.primaryText,
    fontFamily: interFontFamily.bold,
  },
  tabTextInactive: {
    color: spec.colors.inactiveTab,
    fontFamily: interFontFamily.medium,
  },
})
