import { activityDesignSpec } from '@/features/activity/activity-design-spec'
import { ActivityScreenContent } from '@/features/activity/activity-screen-content'
import { useActivityQuery } from '@/features/activity/use-activity-query'
import { interFontFamily } from '@/constants/typography'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function ActivityHeader() {
  return (
    <View style={styles.headerWrap}>
      <Text style={styles.headerTitle}>Activity</Text>
    </View>
  )
}

function ActivityState({
  title,
  description,
  actionLabel,
  onActionPress,
  disabled = false,
}: {
  title: string
  description: string
  actionLabel?: string
  onActionPress?: () => void
  disabled?: boolean
}) {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.primaryButton,
            disabled ? styles.primaryButtonDisabled : null,
            pressed && !disabled ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export default function ActivityScreen() {
  const { account, connect } = useMobileWallet()
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const walletAddress = useMemo(() => account?.address.toString() ?? null, [account])
  const activityQuery = useActivityQuery(walletAddress)

  const handleConnectWallet = useCallback(async () => {
    if (isConnectingWallet) {
      return
    }

    setConnectError(null)
    setIsConnectingWallet(true)

    try {
      await connect()
    } catch {
      setConnectError('Wallet connection failed. Please try again.')
    } finally {
      setIsConnectingWallet(false)
    }
  }, [connect, isConnectingWallet])

  const handleRefresh = useCallback(() => {
    if (!walletAddress) {
      return
    }

    void activityQuery.refetch()
  }, [activityQuery, walletAddress])

  if (!walletAddress) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ActivityHeader />
        <ActivityState
          title="Connect your wallet"
          description={connectError ?? 'Connect a wallet to view your recent swaps and transfer activity.'}
          actionLabel={isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
          disabled={isConnectingWallet}
          onActionPress={() => void handleConnectWallet()}
        />
      </SafeAreaView>
    )
  }

  if (activityQuery.isLoading && activityQuery.sections.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ActivityHeader />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={activityDesignSpec.colors.heading} />
          <Text style={styles.stateDescription}>Loading activity...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (activityQuery.isError && activityQuery.sections.length === 0) {
    const errorMessage =
      activityQuery.error instanceof Error ? activityQuery.error.message : 'Could not load activity right now.'

    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ActivityHeader />
        <ActivityState
          title="Activity unavailable"
          description={errorMessage}
          actionLabel="Retry"
          onActionPress={() => void activityQuery.refetch()}
        />
      </SafeAreaView>
    )
  }

  if (activityQuery.sections.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ActivityHeader />
        <ActivityState
          title="No activity yet"
          description="Your swaps and transfers will appear here once transactions are completed."
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ActivityScreenContent
        sections={activityQuery.sections}
        refreshing={activityQuery.isRefetching}
        onRefresh={handleRefresh}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.85,
  },
  headerTitle: {
    color: activityDesignSpec.colors.heading,
    fontFamily: interFontFamily.bold,
    fontSize: activityDesignSpec.header.titleFontSize,
    letterSpacing: activityDesignSpec.header.titleLetterSpacing,
    lineHeight: activityDesignSpec.header.titleLineHeight,
  },
  headerWrap: {
    paddingBottom: activityDesignSpec.header.bottomPadding,
    paddingHorizontal: activityDesignSpec.header.horizontalPadding,
    paddingTop: activityDesignSpec.header.topPadding,
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
    minWidth: 156,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  screen: {
    backgroundColor: activityDesignSpec.colors.background,
    flex: 1,
  },
  stateContainer: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  stateDescription: {
    color: activityDesignSpec.colors.sectionLabel,
    fontFamily: interFontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  stateTitle: {
    color: activityDesignSpec.colors.primaryText,
    fontFamily: interFontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
})
