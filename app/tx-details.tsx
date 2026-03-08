import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { activityDesignSpec } from '@/features/activity/activity-design-spec'
import type { ActivityEvent, ActivityLeg } from '@/features/activity/types'
import { Ionicons } from '@expo/vector-icons'
import Clipboard from '@react-native-clipboard/clipboard'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useMemo } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function truncateSignature(sig: string): string {
  if (sig.length <= 16) {
    return sig
  }

  return `${sig.slice(0, 8)}...${sig.slice(-8)}`
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function legInitial(leg: ActivityLeg): string {
  if (leg.symbol.length === 0) {
    return '?'
  }

  return leg.symbol.slice(0, 1).toUpperCase()
}

function LegBadge({ leg, size = 40 }: { leg: ActivityLeg; size?: number }) {
  const borderRadius = size / 2

  if (leg.iconUri) {
    return (
      <Image
        source={{ uri: leg.iconUri }}
        style={[styles.legBadge, { borderRadius, height: size, width: size }]}
      />
    )
  }

  return (
    <View style={[styles.legBadge, styles.legBadgeFallback, { borderRadius, height: size, width: size }]}>
      <Text style={styles.legBadgeText}>{legInitial(leg)}</Text>
    </View>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValue}>{children}</View>
    </View>
  )
}

export default function TxDetailsScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ event: string }>()
  const event: ActivityEvent | null = useMemo(() => {
    if (!params.event) {
      return null
    }

    try {
      return JSON.parse(params.event) as ActivityEvent
    } catch {
      return null
    }
  }, [params.event])

  const handleCopySignature = useCallback(() => {
    if (!event?.txSignature) {
      return
    }

    Clipboard.setString(event.txSignature)
  }, [event])

  const handleViewExplorer = useCallback(() => {
    if (!event?.txSignature) {
      return
    }

    void Linking.openURL(`https://solscan.io/tx/${event.txSignature}`)
  }, [event])

  if (!event) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" hitSlop={8} onPress={() => router.back()}>
            <Ionicons color={semanticColors.icon.primary} name="arrow-back" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Transaction not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const isSwap = event.type === 'swap'
  const isFailed = event.status === 'failed'

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" hitSlop={8} onPress={() => router.back()}>
          <Ionicons color={semanticColors.icon.primary} name="arrow-back" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <View style={styles.heroSection}>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                isFailed ? styles.statusDotFailed : styles.statusDotConfirmed,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                isFailed ? styles.statusTextFailed : styles.statusTextConfirmed,
              ]}
            >
              {isFailed ? 'Failed' : 'Confirmed'}
            </Text>
          </View>
          <Text style={styles.heroType}>{isSwap ? 'Swap' : 'Transfer'}</Text>
        </View>

        <View style={styles.amountsCard}>
          {isSwap && event.sentLeg ? (
            <>
              <View style={styles.amountRow}>
                <LegBadge leg={event.sentLeg} />
                <View style={styles.amountTextWrap}>
                  <Text style={styles.amountSent}>{event.sentLeg.amountDisplay}</Text>
                  <Text style={styles.amountSymbol}>{event.sentLeg.symbol}</Text>
                </View>
              </View>
              <View style={styles.arrowRow}>
                <Ionicons color={semanticColors.icon.muted} name="arrow-down" size={20} />
              </View>
              <View style={styles.amountRow}>
                <LegBadge leg={event.receivedLeg} />
                <View style={styles.amountTextWrap}>
                  <Text style={isFailed ? styles.amountSent : styles.amountReceived}>
                    {event.receivedLeg.amountDisplay}
                  </Text>
                  <Text style={styles.amountSymbol}>{event.receivedLeg.symbol}</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.amountRow}>
              <LegBadge leg={event.receivedLeg} />
              <View style={styles.amountTextWrap}>
                <Text
                  style={
                    isFailed
                      ? styles.amountSent
                      : event.receivedLeg.direction === 'receive'
                        ? styles.amountReceived
                        : styles.amountSent
                  }
                >
                  {event.receivedLeg.amountDisplay}
                </Text>
                <Text style={styles.amountSymbol}>{event.receivedLeg.symbol}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.detailsCard}>
          <DetailRow label="Type">
            <Text style={styles.detailValueText}>{isSwap ? 'Swap' : 'Transfer'}</Text>
          </DetailRow>
          <DetailRow label="Status">
            <Text
              style={[
                styles.detailValueText,
                isFailed ? styles.statusTextFailed : styles.statusTextConfirmed,
              ]}
            >
              {isFailed ? 'Failed' : 'Confirmed'}
            </Text>
          </DetailRow>
          <DetailRow label="Source">
            <Text style={styles.detailValueText}>
              {event.source === 'jupiter' ? 'Jupiter' : 'Unknown'}
            </Text>
          </DetailRow>
          <DetailRow label="Date">
            <Text style={styles.detailValueText}>{formatTimestamp(event.timestampIso)}</Text>
          </DetailRow>
          {event.txSignature ? (
            <DetailRow label="TX Hash">
              <Pressable
                accessibilityLabel="Copy transaction hash"
                onPress={handleCopySignature}
                style={({ pressed }) => [styles.txHashPressable, pressed ? styles.pressed : null]}
              >
                <Text style={styles.txHashText}>{truncateSignature(event.txSignature)}</Text>
                <Ionicons color={semanticColors.icon.secondary} name="copy-outline" size={14} />
              </Pressable>
            </DetailRow>
          ) : null}
        </View>

        {event.txSignature ? (
          <Pressable
            accessibilityLabel="View on Solscan explorer"
            accessibilityRole="button"
            onPress={handleViewExplorer}
            style={({ pressed }) => [styles.explorerButton, pressed ? styles.pressed : null]}
          >
            <Ionicons color={semanticColors.icon.primary} name="open-outline" size={18} />
            <Text style={styles.explorerButtonText}>View on Explorer</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  amountReceived: {
    color: semanticColors.text.success,
    fontFamily: interFontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  amountSent: {
    color: semanticColors.text.dimmed,
    fontFamily: interFontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  amountSymbol: {
    color: semanticColors.text.secondary,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  amountTextWrap: {
    flex: 1,
    gap: 2,
  },
  amountsCard: {
    backgroundColor: activityDesignSpec.colors.rowBackground,
    borderRadius: 16,
    gap: 4,
    marginHorizontal: 16,
    padding: 16,
  },
  arrowRow: {
    alignItems: 'center',
    paddingLeft: 10,
    paddingVertical: 2,
  },
  detailLabel: {
    color: semanticColors.text.dimmed,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  detailValue: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  detailValueText: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  detailsCard: {
    backgroundColor: activityDesignSpec.colors.rowBackground,
    borderRadius: 16,
    gap: 4,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: semanticColors.text.dimmed,
    fontFamily: interFontFamily.regular,
    fontSize: 16,
  },
  explorerButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    paddingVertical: 12,
  },
  explorerButtonText: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerSpacer: {
    width: 24,
  },
  headerTitle: {
    color: semanticColors.text.headingOnDark,
    flex: 1,
    fontFamily: interFontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  heroSection: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 20,
    paddingTop: 16,
  },
  heroType: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
  },
  legBadge: {
    borderColor: activityDesignSpec.colors.badgeBackground,
    borderWidth: 2,
  },
  legBadgeFallback: {
    alignItems: 'center',
    backgroundColor: activityDesignSpec.colors.badgeBackground,
    justifyContent: 'center',
  },
  legBadgeText: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  screen: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusDotConfirmed: {
    backgroundColor: semanticColors.text.success,
  },
  statusDotFailed: {
    backgroundColor: semanticColors.text.danger,
  },
  statusText: {
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  statusTextConfirmed: {
    color: semanticColors.text.success,
  },
  statusTextFailed: {
    color: semanticColors.text.danger,
  },
  txHashPressable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  txHashText: {
    color: semanticColors.text.primary,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
})
