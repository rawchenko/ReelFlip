import { activityDesignSpec } from '@/features/activity/activity-design-spec'
import { ActivityRow } from '@/features/activity/activity-row'
import { ActivitySection as ActivitySectionHeader } from '@/features/activity/activity-section'
import { ActivityEvent, ActivitySection } from '@/features/activity/types'
import { interFontFamily } from '@/constants/typography'
import React, { useMemo } from 'react'
import { SectionList, StyleSheet, Text, View } from 'react-native'

interface ActivityScreenContentProps {
  sections: ActivitySection[]
  refreshing: boolean
  onRefresh: () => void
}

function keyExtractor(item: ActivityEvent): string {
  return item.id
}

export function ActivityScreenContent({ sections, refreshing, onRefresh }: ActivityScreenContentProps) {
  const listSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        data: section.items,
      })),
    [sections],
  )

  return (
    <SectionList
      sections={listSections}
      keyExtractor={keyExtractor}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderSectionHeader={({ section }) => <ActivitySectionHeader label={section.label} />}
      renderItem={({ item, index }) => (
        <View style={[styles.rowWrap, index > 0 ? styles.rowWrapWithGap : null]}>
          <ActivityRow item={item} />
        </View>
      )}
      SectionSeparatorComponent={() => <View style={styles.sectionSpacer} />}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  headerTitle: {
    color: activityDesignSpec.colors.heading,
    fontFamily: interFontFamily.bold,
    fontSize: activityDesignSpec.header.titleFontSize,
    letterSpacing: activityDesignSpec.header.titleLetterSpacing,
    lineHeight: activityDesignSpec.header.titleLineHeight,
  },
  headerWrap: {
    paddingBottom: activityDesignSpec.header.bottomPadding,
    paddingHorizontal: activityDesignSpec.header.horizontalPadding,
    paddingTop: activityDesignSpec.header.topPadding,
  },
  list: {
    backgroundColor: activityDesignSpec.colors.background,
    flex: 1,
  },
  listContent: {
    paddingBottom: activityDesignSpec.section.listBottomPadding,
  },
  rowWrap: {
    paddingHorizontal: activityDesignSpec.section.horizontalPadding,
  },
  rowWrapWithGap: {
    marginTop: activityDesignSpec.section.rowGap,
  },
  sectionSpacer: {
    height: activityDesignSpec.section.sectionGap,
  },
})
