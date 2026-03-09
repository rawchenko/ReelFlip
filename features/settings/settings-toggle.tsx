import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

const spec = settingsDesignSpec

const TIMING_CONFIG = { duration: 200 }

export function SettingsToggle({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  const progress = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, TIMING_CONFIG)
  }, [value, progress])

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [spec.colors.toggleOff, spec.colors.toggleOn]),
  }))

  const knobStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [spec.toggle.knobSizeOff, spec.toggle.knobSizeOn])
    const maxTravel = spec.toggle.width - spec.toggle.padding * 2 - spec.toggle.knobSizeOn
    const translateX = interpolate(progress.value, [0, 1], [0, maxTravel])

    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      transform: [{ translateX }],
    }
  })

  return (
    <Pressable onPress={() => onValueChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  knob: {
    backgroundColor: spec.colors.toggleKnob,
  },
  track: {
    alignItems: 'center',
    borderRadius: spec.toggle.borderRadius,
    flexDirection: 'row',
    height: spec.toggle.height,
    padding: spec.toggle.padding,
    width: spec.toggle.width,
  },
})
