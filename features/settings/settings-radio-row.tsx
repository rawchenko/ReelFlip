import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { interFontFamily } from '@/constants/typography'
import React, { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

function RadioCircle({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radioOuter, selected ? styles.radioOuterSelected : styles.radioOuterUnselected]}>
      {selected ? <View style={styles.radioInnerDot} /> : null}
    </View>
  )
}

export function SettingsRadioRow({
  selected,
  onSelect,
  label,
  subtitle,
  leftContent,
  radioPosition = 'left',
}: {
  selected: boolean
  onSelect: () => void
  label: string
  subtitle?: string
  leftContent?: ReactNode
  radioPosition?: 'left' | 'right'
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={[styles.container, selected ? styles.containerSelected : null]}
    >
      {radioPosition === 'left' ? <RadioCircle selected={selected} /> : null}

      {leftContent ?? null}

      <View style={styles.textContainer}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {radioPosition === 'right' ? <RadioCircle selected={selected} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spec.row.gap,
    height: spec.row.height,
    paddingLeft: spec.row.paddingLeft,
    paddingRight: spec.row.paddingRight,
  },
  containerSelected: {
    backgroundColor: spec.colors.selectedRowHighlight,
  },
  label: {
    color: spec.colors.rowTitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.row.titleFontSize,
    lineHeight: spec.row.titleLineHeight,
  },
  radioInnerDot: {
    backgroundColor: spec.colors.radioSelected,
    borderRadius: spec.radio.innerDotSize / 2,
    height: spec.radio.innerDotSize,
    width: spec.radio.innerDotSize,
  },
  radioOuter: {
    alignItems: 'center',
    borderRadius: spec.radio.borderRadius,
    borderWidth: spec.radio.borderWidth,
    height: spec.radio.size,
    justifyContent: 'center',
    width: spec.radio.size,
  },
  radioOuterSelected: {
    borderColor: spec.colors.radioSelected,
  },
  radioOuterUnselected: {
    borderColor: spec.colors.radioBorder,
  },
  subtitle: {
    color: spec.colors.rowSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.row.subtitleFontSize,
    lineHeight: spec.row.subtitleLineHeight,
  },
  textContainer: {
    flex: 1,
  },
})
