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
  profileDebugLink: {
    borderColor: '#314570',
    borderRadius: 10,
    borderWidth: 1,
    color: '#d6deed',
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
    color: '#8fa6cc',
    fontSize: 15,
    textAlign: 'center',
  },
  tabPlaceholderTitle: {
    color: '#f5f8ff',
    fontSize: 30,
    fontWeight: '800',
  },
  tabScreen: {
    backgroundColor: '#070d1a',
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
})
