import { ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'

export type IoniconName = ComponentProps<typeof Ionicons>['name']

export type SettingsRowAccessory = 'chevron' | 'toggle' | 'external-link' | 'none'

export interface SettingsRowConfig {
  id: string
  icon: IoniconName
  title: string
  subtitle?: string
  accessory: SettingsRowAccessory
  onPress?: () => void
  toggleValue?: boolean
  onToggle?: (value: boolean) => void
  trailingDotColor?: string
  isDanger?: boolean
  isMuted?: boolean
}

export interface SettingsSectionConfig {
  title: string
  rows: SettingsRowConfig[]
}

export interface RadioOption<T extends string> {
  value: T
  label: string
  subtitle?: string
}
