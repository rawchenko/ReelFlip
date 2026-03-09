import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import type { AllocationSegment } from '@/features/profile/types'
import React from 'react'
import { StyleSheet, View } from 'react-native'

const spec = profileDesignSpec

export function ProfileAllocationBar({ segments }: { segments: AllocationSegment[] }) {
  return (
    <View style={styles.container}>
      {segments.map((segment) => (
        <View
          key={segment.symbol}
          style={[
            styles.segment,
            {
              backgroundColor: segment.color,
              flexGrow: segment.proportion,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spec.allocation.gap,
    paddingBottom: spec.allocation.bottomPadding,
    paddingHorizontal: spec.allocation.horizontalPadding,
  },
  segment: {
    borderRadius: spec.allocation.barRadius,
    flexBasis: 0,
    flexShrink: 1,
    height: spec.allocation.barHeight,
  },
})
