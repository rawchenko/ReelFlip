import { StyleSheet } from 'react-native'

export const appStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d1d1',
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
  feedDebugLink: {
    color: '#8ea7e8',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 4,
  },
  feedEmptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  feedEmptyText: {
    color: '#8fa6cc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  feedEmptyTitle: {
    color: '#f5f8ff',
    fontSize: 20,
    fontWeight: '700',
  },
  feedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedList: {
    flex: 1,
  },
  feedPage: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  feedScreen: {
    backgroundColor: '#070d1a',
    flex: 1,
  },
  feedTitle: {
    color: '#f5f8ff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stack: {
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
})
