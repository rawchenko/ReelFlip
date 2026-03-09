import { profileDesignSpec } from '@/features/profile/profile-design-spec'

const spec = profileDesignSpec

export function getChangeColor(value: number): string {
  if (value > 0) return spec.colors.positiveChange
  if (value < 0) return spec.colors.negativeChange
  return spec.colors.secondaryText
}

export function getChangeArrow(value: number): string {
  if (value > 0) return '\u25B4'
  if (value < 0) return '\u25BE'
  return ''
}
