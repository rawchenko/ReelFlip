import { StyleSheet } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'

export const appStyles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.app.backgroundCanvas,
    borderColor: semanticColors.border.light,
    borderRadius: 2,
    borderWidth: 1,
    elevation: 1,
    padding: 4,
  },
  screen: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 8,
  },
  feedEmptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  feedEmptyText: {
    color: semanticColors.text.muted,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  feedEmptyTitle: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.bold,
    fontSize: 20,
  },
  feedList: {
    flex: 1,
  },
  feedPage: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  feedScreen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  profileDebugLink: {
    borderColor: semanticColors.border.muted,
    borderRadius: 10,
    borderWidth: 1,
    color: semanticColors.text.secondary,
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stack: {
    gap: 8,
  },
  tabPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  tabPlaceholderText: {
    color: semanticColors.text.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  tabPlaceholderTitle: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.extraBold,
    fontSize: 30,
  },
  tabScreen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  title: {
    fontFamily: interFontFamily.bold,
    fontSize: 20,
  },
})
