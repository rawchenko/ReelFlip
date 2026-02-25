import { StyleSheet } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'

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
    fontSize: 20,
    fontWeight: '700',
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
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 30,
    fontWeight: '800',
  },
  tabScreen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
})
