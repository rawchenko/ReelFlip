import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { FeedCardAction, FeedTradeSide, TokenFeedItem } from '@/features/feed/types'
import React, { useMemo } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

export type FeedPlaceholderSheetType = FeedCardAction | FeedTradeSide

export interface FeedPlaceholderSheetPayload {
  type: FeedPlaceholderSheetType
  item: TokenFeedItem
}

interface FeedPlaceholderSheetProps {
  payload: FeedPlaceholderSheetPayload | null
  onClose: () => void
}

interface SheetCopy {
  title: string
  description: string
}

function getSheetCopy(type: FeedPlaceholderSheetType): SheetCopy {
  switch (type) {
    case 'buy':
      return {
        title: 'Buy',
        description: 'Quick-buy flow will be connected in a future iteration.',
      }
    case 'sell':
      return {
        title: 'Sell',
        description: 'Quick-sell flow will be connected in a future iteration.',
      }
    case 'like':
      return {
        title: 'Like / Watchlist',
        description: 'Watchlist actions will be connected when Following feed support lands.',
      }
    case 'comment':
      return {
        title: 'Comments',
        description: 'Token discussion threads are not available in this build yet.',
      }
    case 'share':
      return {
        title: 'Share',
        description: 'Share sheets and deeplinks will be added in a future iteration.',
      }
    case 'hide':
      return {
        title: 'Hide',
        description: 'Hide / Not interested controls will be connected in a future iteration.',
      }
  }
}

export function FeedPlaceholderSheet({ payload, onClose }: FeedPlaceholderSheetProps) {
  const copy = useMemo(() => (payload ? getSheetCopy(payload.type) : null), [payload])

  return (
    <Modal
      animationType="slide"
      transparent
      visible={Boolean(payload)}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdropRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close placeholder sheet" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title}>{copy?.title ?? 'Coming soon'}</Text>
          {payload ? (
            <Text style={styles.tokenText}>
              {payload.item.symbol} · {payload.item.name}
            </Text>
          ) : null}
          <Text style={styles.description}>{copy?.description ?? 'This action is not available yet.'}</Text>
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdropRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.app.backgroundPanelAlt,
    borderColor: semanticColors.border.panel,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  closeButtonText: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.bold,
    fontSize: 15,
  },
  description: {
    color: semanticColors.text.secondary,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: semanticColors.border.muted,
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 44,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
  },
  sheet: {
    backgroundColor: semanticColors.app.backgroundElevated,
    borderTopColor: semanticColors.border.default,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  title: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.extraBold,
    fontSize: 20,
  },
  tokenText: {
    color: semanticColors.text.info,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    marginTop: 4,
  },
})
