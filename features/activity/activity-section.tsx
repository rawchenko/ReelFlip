import { activityDesignSpec } from '@/features/activity/activity-design-spec'
import { interFontFamily } from '@/constants/typography'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface ActivitySectionProps {
  label: string
}

export function ActivitySection({ label }: ActivitySectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: activityDesignSpec.section.labelVerticalGap,
    paddingHorizontal: activityDesignSpec.section.horizontalPadding,
    paddingTop: activityDesignSpec.section.labelVerticalGap,
  },
  label: {
    color: activityDesignSpec.colors.sectionLabel,
    fontFamily: interFontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
})
