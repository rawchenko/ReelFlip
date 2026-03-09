import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { interFontFamily } from '@/constants/typography'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

export function SettingsResetDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons name="warning-outline" size={24} color={spec.colors.dangerText} style={styles.icon} />
          <Text style={styles.title}>Reset Onboarding?</Text>
          <Text style={styles.description}>
            This will clear all your preferences and walk you through setup again. Your wallet and funds are not
            affected.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Reset"
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [styles.resetButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    gap: spec.dialog.gap,
    justifyContent: 'center',
  },
  cancelButton: {
    alignItems: 'center',
    borderRadius: spec.dialog.buttonBorderRadius,
    justifyContent: 'center',
    paddingHorizontal: spec.dialog.buttonPaddingHorizontal,
    paddingVertical: spec.dialog.buttonPaddingVertical,
  },
  cancelText: {
    color: spec.colors.dialogCancelText,
    fontFamily: interFontFamily.medium,
    fontSize: spec.dialog.buttonFontSize,
    letterSpacing: spec.dialog.buttonLetterSpacing,
    lineHeight: spec.dialog.buttonLineHeight,
  },
  card: {
    backgroundColor: spec.colors.dialogBackground,
    borderRadius: spec.dialog.borderRadius,
    gap: spec.dialog.gap,
    padding: spec.dialog.padding,
    width: spec.dialog.width,
  },
  description: {
    color: spec.colors.dialogDescription,
    fontFamily: interFontFamily.regular,
    fontSize: spec.dialog.descriptionFontSize,
    lineHeight: spec.dialog.descriptionLineHeight,
    textAlign: 'center',
  },
  icon: {
    alignSelf: 'center',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flex: 1,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: spec.colors.dialogResetBg,
    borderRadius: spec.dialog.buttonBorderRadius,
    justifyContent: 'center',
    paddingHorizontal: spec.dialog.buttonPaddingHorizontal,
    paddingVertical: spec.dialog.buttonPaddingVertical,
  },
  resetText: {
    color: spec.colors.dialogResetText,
    fontFamily: interFontFamily.medium,
    fontSize: spec.dialog.buttonFontSize,
    letterSpacing: spec.dialog.buttonLetterSpacing,
    lineHeight: spec.dialog.buttonLineHeight,
  },
  title: {
    color: spec.colors.dialogTitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.dialog.titleFontSize,
    lineHeight: spec.dialog.titleLineHeight,
    textAlign: 'center',
  },
})
