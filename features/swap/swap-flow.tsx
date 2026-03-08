import { useAccountTokenBalances } from '@/features/account/use-account-token-balances'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily, spaceGroteskFamily } from '@/constants/typography'
import { FeedPlaceholderSheet, FeedPlaceholderSheetPayload } from '@/features/feed/feed-placeholder-sheet'
import { apiSwapQuoteAdapter } from '@/features/swap/api/swap-client'
import {
  clampSlippageBps,
  createSwapDraft,
  getCounterAssetOptions,
  normalizeAmountInput,
  parseAmountInput,
} from '@/features/swap/mock-swap'
import { isSwapAssetEnabled, isSwapChainSupported } from '@/features/swap/swap-config'
import { swapDesignSpec } from '@/features/swap/swap-design-spec'
import type {
  SwapDraft,
  SwapFailureReason,
  SwapFlowPayload,
  SwapProgressStep,
  SwapQuoteAdapter,
  SwapQuoteAssetView,
  SwapQuotePreview,
  SwapResult,
  SwapSuccessResult,
} from '@/features/swap/types'
import Clipboard from '@react-native-clipboard/clipboard'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { getBase64EncodedWireTransaction, getTransactionDecoder } from '@solana/transactions'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { Base64 } from 'js-base64'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNetwork } from '@/features/network/use-network'

type SwapStage = 'entry' | 'confirm' | 'processing' | 'success' | 'failure' | 'pending'

const COUNTER_ASSET_MINTS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
}
const STATUS_POLL_INTERVAL_MS = 1_000
const STATUS_POLL_TIMEOUT_MS = 45_000
const LIVE_PROCESSING_STEPS: SwapProgressStep[] = [
  {
    description: 'Latest quote refreshed from Jupiter',
    durationMs: 0,
    id: 'quote_locked',
    title: 'Quote locked',
  },
  {
    description: 'Approve the transaction in your wallet',
    durationMs: 0,
    id: 'wallet_approved',
    title: 'Wallet approval',
  },
  {
    description: 'Submitting your signed transaction',
    durationMs: 0,
    id: 'broadcasting',
    title: 'Broadcasting',
  },
  {
    description: 'Waiting for on-chain confirmation',
    durationMs: 0,
    id: 'confirmation',
    title: 'Confirmation',
  },
]

function triggerSelectionHaptic() {
  void Haptics.selectionAsync().catch(() => { })
}

function triggerImpactHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { })
}

function normalizeTokenImageUri(input?: string | null): string | null {
  if (typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^ipfs:\/\//i.test(trimmed)) {
    const hash = trimmed.replace(/^ipfs:\/\//i, '').replace(/^\/+/, '')
    return hash.length > 0 ? `https://ipfs.io/ipfs/${hash}` : null
  }

  return null
}

function formatAmount(value: number, symbol?: string): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  const decimals = symbol === 'USDC' ? 2 : value >= 1_000 ? 0 : value >= 10 ? 2 : 4
  return value.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals === 0 ? 0 : 2,
  })
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00'
  }

  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }

  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

function formatSlippage(slippageBps: number): string {
  return `${(slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 0 : 2)}%`
}

function getImpactLabel(priceImpactPct: number): string {
  if (priceImpactPct < 0.5) {
    return 'Low'
  }

  if (priceImpactPct < 1.2) {
    return 'Moderate'
  }

  return 'Elevated'
}

function resolveAssetImageUri(asset: SwapQuoteAssetView, draft: SwapDraft): string | undefined {
  if (asset.imageUri) return undefined // already has image
  if (asset.symbol === draft.token.symbol) {
    return draft.token.imageUri ?? `https://tokens.jup.ag/token/${draft.token.mint}/icon`
  }
  const counterMint = COUNTER_ASSET_MINTS[asset.symbol]
  if (counterMint) {
    return `https://tokens.jup.ag/token/${counterMint.mint}/icon`
  }
  return undefined
}

function enrichQuoteTokenImage(quote: SwapQuotePreview, draft: SwapDraft): SwapQuotePreview {
  let inputAsset = quote.inputAsset
  let outputAsset = quote.outputAsset

  const inputFallback = resolveAssetImageUri(inputAsset, draft)
  if (inputFallback) {
    inputAsset = { ...inputAsset, imageUri: inputFallback }
  }
  const outputFallback = resolveAssetImageUri(outputAsset, draft)
  if (outputFallback) {
    outputAsset = { ...outputAsset, imageUri: outputFallback }
  }

  if (inputAsset === quote.inputAsset && outputAsset === quote.outputAsset) {
    return quote
  }

  return { ...quote, inputAsset, outputAsset }
}

function getStageTitle(stage: SwapStage): string {
  if (stage === 'entry') return 'Swap Tokens'
  if (stage === 'confirm') return 'Confirm Swap'
  if (stage === 'processing') return 'Processing Swap'
  if (stage === 'pending') return 'Swap Pending'
  return stage === 'success' ? 'Swap Complete' : 'Swap Failed'
}

function sanitizeDraftAmount(amountText: string): string {
  const normalized = normalizeAmountInput(amountText)
  if (normalized.length === 0) {
    return ''
  }

  const parts = normalized.split('.')
  if (parts.length <= 2) {
    return normalized
  }

  return `${parts[0]}.${parts.slice(1).join('')}`
}

function createSubmitIdempotencyKey(): string {
  return `swap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function isDraftAmountComplete(draft: SwapDraft): boolean {
  const amountText = draft.amountText.trim()
  if (amountText.length === 0) {
    return false
  }

  if (amountText === '.' || amountText.endsWith('.')) {
    return false
  }

  return draft.amount > 0
}

function isQuoteExpired(quote: SwapQuotePreview): boolean {
  return Date.now() >= new Date(quote.expiresAt).getTime()
}

function createFailureResult(input: {
  attemptedPathLabel: string
  message: string
  failureCode?: string
  reason?: SwapFailureReason
  suggestedSlippageBps?: number
  suggestion?: string
  title?: string
}): Extract<SwapResult, { kind: 'failure' }> {
  return {
    attemptedPathLabel: input.attemptedPathLabel,
    ...(input.failureCode ? { failureCode: input.failureCode as Extract<SwapResult, { kind: 'failure' }>['failureCode'] } : {}),
    kind: 'failure',
    message: input.message,
    reason: input.reason ?? 'routing_unavailable',
    suggestedSlippageBps: input.suggestedSlippageBps ?? 50,
    suggestion: input.suggestion ?? 'Refresh the quote and try again.',
    title: input.title ?? 'Swap unavailable',
  }
}

function createPendingResult(
  tradeId: string,
  signature: string,
  overrides?: Partial<Pick<Extract<SwapResult, { kind: 'pending' }>, 'message' | 'statusLabel'>>,
): Extract<SwapResult, { kind: 'pending' }> {
  return {
    kind: 'pending',
    message: overrides?.message ?? 'The transaction was submitted, but final confirmation is taking longer than expected.',
    signature,
    statusLabel: overrides?.statusLabel ?? 'Pending confirmation',
    tradeId,
  }
}

function Avatar({
  badgeColor,
  badgeText,
  imageUri,
  size = 44,
}: {
  badgeColor: string
  badgeText: string
  imageUri?: string | null
  size?: number
}) {
  const normalizedImageUri = useMemo(() => normalizeTokenImageUri(imageUri), [imageUri])
  const [imageError, setImageError] = useState(false)

  if (normalizedImageUri && !imageError) {
    return (
      <Image
        onError={() => setImageError(true)}
        source={{ uri: normalizedImageUri }}
        style={[styles.avatarImage, { height: size, width: size }]}
      />
    )
  }

  return (
    <View style={[styles.avatarFallback, { backgroundColor: badgeColor, height: size, width: size }]}>
      <Text style={styles.avatarFallbackText}>{badgeText}</Text>
    </View>
  )
}

function SummaryRow({
  dotColor,
  isLast = false,
  label,
  value,
  valueTone = 'default',
}: {
  dotColor?: string
  isLast?: boolean
  label: string
  value: string
  valueTone?: 'default' | 'accent' | 'muted' | 'danger' | 'success'
}) {
  const valueStyle = [
    styles.summaryValue,
    valueTone === 'accent' ? styles.summaryValueAccent : null,
    valueTone === 'muted' ? styles.summaryValueMuted : null,
    valueTone === 'danger' ? styles.summaryValueDanger : null,
    valueTone === 'success' ? styles.summaryValueSuccess : null,
  ]

  return (
    <View style={[styles.summaryRow, isLast ? styles.summaryRowLast : null]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      {dotColor ? (
        <View style={styles.summaryValueWithDot}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={valueStyle}>{value}</Text>
        </View>
      ) : (
        <Text style={valueStyle}>{value}</Text>
      )}
    </View>
  )
}

function Chip({
  label,
  selected = false,
  onPress,
  tone = 'neutral',
}: {
  label: string
  onPress?: () => void
  selected?: boolean
  tone?: 'neutral' | 'danger'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        tone === 'danger' ? styles.chipDanger : null,
        pressed ? styles.pressableDown : null,
      ]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  )
}

function AssetPill({
  badgeColor,
  badgeText,
  chevron = true,
  imageUri,
  label,
  onPress,
}: {
  badgeColor: string
  badgeText: string
  chevron?: boolean
  imageUri?: string | null
  label: string
  onPress?: () => void
}) {
  const normalizedImageUri = useMemo(() => normalizeTokenImageUri(imageUri), [imageUri])
  const [imageError, setImageError] = useState(false)
  const content = (
    <View style={styles.assetPill}>
      {normalizedImageUri && !imageError ? (
        <Image onError={() => setImageError(true)} source={{ uri: normalizedImageUri }} style={styles.assetPillImage} />
      ) : (
        <View style={[styles.assetPillBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.assetPillBadgeText}>{badgeText}</Text>
        </View>
      )}
      <Text style={styles.assetPillLabel}>{label}</Text>
      {chevron ? <Ionicons color={swapDesignSpec.colors.iconPrimary} name="chevron-down" size={16} /> : null}
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => (pressed ? styles.pressableDown : null)}>
      {content}
    </Pressable>
  )
}

function SlideToConfirm({
  disabled = false,
  isBusy = false,
  label,
  onComplete,
}: {
  disabled?: boolean
  isBusy?: boolean
  label: string
  onComplete: () => void
}) {
  const { width } = useWindowDimensions()
  const trackWidth = Math.min(width - 32, 358)
  const thumbSize = 52
  const horizontalPadding = 6
  const maxTranslateX = trackWidth - thumbSize - horizontalPadding * 2
  const translateX = useRef(new Animated.Value(0)).current
  const hasCompletedRef = useRef(false)

  useEffect(() => {
    if (!disabled && !isBusy) {
      hasCompletedRef.current = false
    }
  }, [disabled, isBusy])

  const animateThumb = useCallback(
    (toValue: number) => {
      Animated.spring(translateX, {
        bounciness: 0,
        speed: 22,
        toValue,
        useNativeDriver: true,
      }).start()
    },
    [translateX],
  )

  const confirm = useCallback(() => {
    if (disabled || isBusy || hasCompletedRef.current) {
      return
    }

    hasCompletedRef.current = true
    animateThumb(maxTranslateX)
    triggerImpactHaptic()
    onComplete()
  }, [animateThumb, disabled, isBusy, maxTranslateX, onComplete])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => !disabled && !isBusy && Math.abs(gestureState.dx) > 4,
        onPanResponderGrant: () => {
          translateX.stopAnimation()
        },
        onPanResponderMove: (_, gestureState) => {
          if (disabled || isBusy) {
            return
          }

          const clamped = Math.max(0, Math.min(maxTranslateX, gestureState.dx))
          translateX.setValue(clamped)
        },
        onPanResponderRelease: (_, gestureState) => {
          if (disabled || isBusy) {
            animateThumb(0)
            return
          }

          if (gestureState.dx >= maxTranslateX * 0.84) {
            confirm()
            return
          }

          animateThumb(0)
        },
      }),
    [animateThumb, confirm, disabled, isBusy, maxTranslateX, translateX],
  )

  return (
    <Pressable
      accessibilityHint="Slide or double tap to confirm the swap."
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || isBusy}
      onPress={confirm}
      style={[styles.sliderTrack, disabled ? styles.sliderTrackDisabled : null, { width: trackWidth }]}
    >
      <LinearGradient colors={[swapDesignSpec.colors.sliderGlowTop, swapDesignSpec.colors.sliderGlowBottom]} style={styles.sliderTrackGlow} />
      <Text style={[styles.sliderTrackLabel, isBusy ? styles.sliderTrackLabelBusy : null]}>{label}</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sliderThumb,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        {isBusy ? <ActivityIndicator color={swapDesignSpec.colors.iconOnLight} size="small" /> : <Ionicons color={swapDesignSpec.colors.iconOnLight} name="arrow-forward" size={22} />}
      </Animated.View>
    </Pressable>
  )
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed ? styles.pressableDown : null]}>
      <View style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
      </View>
    </Pressable>
  )
}

function SecondaryButton({
  icon,
  iconPosition = 'left',
  label,
  onPress,
  tone = 'neutral',
}: {
  icon?: keyof typeof Ionicons.glyphMap
  iconPosition?: 'left' | 'right'
  label: string
  onPress: () => void
  tone?: 'neutral' | 'danger'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        tone === 'danger' ? styles.secondaryButtonDanger : null,
        pressed ? styles.pressableDown : null,
      ]}
    >
      {icon && iconPosition === 'left' ? <Ionicons color={swapDesignSpec.colors.secondaryOutlineText} name={icon} size={16} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
      {icon && iconPosition === 'right' ? <Ionicons color={swapDesignSpec.colors.secondaryOutlineText} name={icon} size={14} /> : null}
    </Pressable>
  )
}

function SlippagePill({ slippageBps }: { slippageBps: number }) {
  return (
    <View style={styles.slippagePill}>
      <Ionicons color={swapDesignSpec.colors.iconMuted} name="grid-outline" size={14} />
      <Text style={styles.slippagePillText}>{formatSlippage(slippageBps)}</Text>
    </View>
  )
}

function EntryScreen({
  canContinue,
  draft,
  footerMessage,
  isQuoteLoading,
  nowMs,
  onAmountTextChange,
  onContinue,
  onCycleCounterAsset,
  quote,
  walletBalance,
}: {
  canContinue?: boolean
  draft: SwapDraft
  footerMessage?: string | null
  isQuoteLoading: boolean
  nowMs: number
  onAmountTextChange: (nextValue: string) => void
  onContinue: () => void
  onCycleCounterAsset: () => void
  quote: SwapQuotePreview | null
  walletBalance?: number | null
}) {
  const isContinueEnabled = typeof canContinue === 'boolean' ? canContinue : Boolean(quote && draft.amount > 0)
  const canCycleOnPayCard = draft.side === 'buy'
  const inputAsset = quote?.inputAsset
  const outputAsset = quote?.outputAsset
  const displayBalance = inputAsset?.balance ?? walletBalance ?? 0
  const quoteCountdown =
    quote
      ? Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - nowMs) / 1_000))
      : 0

  return (
    <View style={styles.entryBody}>
      <View style={styles.cardsSection}>
        <View style={styles.quoteCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardEyebrow}>You Pay</Text>
            <Text style={styles.cardBalance}>
              Balance: {formatAmount(displayBalance, inputAsset?.symbol ?? draft.counterAssetSymbol)} {inputAsset?.symbol ?? draft.counterAssetSymbol}
            </Text>
          </View>
          <View style={styles.amountRow}>
            <TextInput
              accessibilityLabel="Swap amount"
              keyboardType="decimal-pad"
              onChangeText={onAmountTextChange}
              placeholder="0"
              placeholderTextColor={swapDesignSpec.colors.inputPlaceholder}
              selectionColor={swapDesignSpec.colors.accentPrimary}
              style={styles.amountInput}
              value={draft.amountText}
            />
            {inputAsset ? (
              <AssetPill
                badgeColor={inputAsset.badgeColor}
                badgeText={inputAsset.badgeText}
                chevron={canCycleOnPayCard}
                imageUri={inputAsset.imageUri}
                label={inputAsset.symbol}
                onPress={canCycleOnPayCard ? onCycleCounterAsset : undefined}
              />
            ) : null}
          </View>
          <Text style={styles.amountSubtext}>≈ {formatCurrency(inputAsset?.usdValue ?? 0)}</Text>
        </View>

        <View style={styles.quoteCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardEyebrow}>You Receive</Text>
            <Text style={styles.cardBalance}>Min {formatAmount(quote?.minimumReceived ?? 0, outputAsset?.symbol)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.receiveAmount}>{formatAmount(outputAsset?.amount ?? 0, outputAsset?.symbol)}</Text>
            {outputAsset ? (
              <AssetPill
                badgeColor={outputAsset.badgeColor}
                badgeText={outputAsset.badgeText}
                chevron={!canCycleOnPayCard}
                imageUri={outputAsset.imageUri}
                label={outputAsset.symbol}
                onPress={!canCycleOnPayCard ? onCycleCounterAsset : undefined}
              />
            ) : null}
          </View>
          <Text style={styles.amountSubtext}>≈ {formatCurrency(outputAsset?.usdValue ?? 0)}</Text>
        </View>

        <View style={styles.swapDirectionBadge}>
          <View style={styles.swapDirectionCircle}>
            <Ionicons color={swapDesignSpec.colors.iconMuted} name="arrow-down" size={14} />
          </View>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="Provider" value={quote?.providerLabel ? `${quote.providerLabel} via 0x` : 'Jupiter via 0x'} />
        <SummaryRow
          label="Rate"
          value={
            quote
              ? `1 ${quote.inputAsset.symbol} ≈ ${formatAmount(quote.exchangeRate, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`
              : '--'
          }
        />
        <SummaryRow label="Fees" value={quote ? formatCurrency(quote.platformFeeUsd) : '--'} />
        <SummaryRow
          label="Price Impact"
          value={quote ? `${quote.priceImpactPct.toFixed(2)}% ${getImpactLabel(quote.priceImpactPct)}` : '--'}
          valueTone="success"
        />
        <SummaryRow isLast label="Slippage" value={formatSlippage(draft.slippageBps)} />
      </View>

      <View style={styles.entryFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={!isContinueEnabled}
          onPress={onContinue}
          style={({ pressed }) => [pressed ? styles.pressableDown : null]}
        >
          <View style={[styles.primaryButton, !isContinueEnabled ? styles.primaryButtonDisabled : null]}>
            <Text style={styles.primaryButtonText}>
              Swap {formatAmount(draft.amount, inputAsset?.symbol)} {inputAsset?.symbol ?? ''} → {outputAsset?.symbol ?? ''}
            </Text>
          </View>
        </Pressable>
        <View style={styles.entryFooterQuote}>
          <View style={styles.quoteRefreshDot} />
          <Text style={styles.footerCaption}>
            {footerMessage ?? (isQuoteLoading ? 'Refreshing quote...' : `Quote refreshes in ${quoteCountdown}s`)}
          </Text>
        </View>
      </View>
    </View>
  )
}

function ConfirmScreen({
  isBusy,
  nowMs,
  onConfirm,
  quote,
}: {
  isBusy: boolean
  nowMs: number
  onConfirm: () => void
  quote: SwapQuotePreview
}) {
  const quoteCountdown = Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - nowMs) / 1_000))

  return (
    <View style={styles.stageBody}>
      <View style={styles.confirmHero}>
        <View style={styles.confirmTokenBlock}>
          <Avatar badgeColor={quote.inputAsset.badgeColor} badgeText={quote.inputAsset.badgeText} imageUri={quote.inputAsset.imageUri} size={56} />
          <Text style={styles.confirmHeroAmount}>{formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)}</Text>
          <Text style={styles.confirmHeroSymbol}>{quote.inputAsset.symbol}</Text>
        </View>
        <Ionicons color={swapDesignSpec.colors.iconMuted} name="arrow-forward" size={20} />
        <View style={styles.confirmTokenBlock}>
          <Avatar badgeColor={quote.outputAsset.badgeColor} badgeText={quote.outputAsset.badgeText} imageUri={quote.outputAsset.imageUri} size={56} />
          <Text style={styles.confirmHeroAmount}>{formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)}</Text>
          <Text style={styles.confirmHeroSymbol}>{quote.outputAsset.symbol}</Text>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="You Send" value={`${formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} ${quote.inputAsset.symbol}`} />
        <SummaryRow
          label="You Receive"
          value={`~${formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`}
          valueTone="accent"
        />
        <SummaryRow
          label="Minimum Received"
          value={`${formatAmount(quote.minimumReceived, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`}
        />
        <SummaryRow
          label="Exchange Rate"
          value={`1 ${quote.inputAsset.symbol} ≈ ${formatAmount(quote.exchangeRate, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`}
        />
        <SummaryRow label="Network Fee" value={`~$${quote.networkFeeSol.toFixed(3)} SOL`} />
        <SummaryRow label="Jupiter Fee" value={formatCurrency(quote.platformFeeUsd)} />
        <SummaryRow label="Price Impact" value={`${quote.priceImpactPct.toFixed(2)}%`} valueTone="accent" />
      </View>

      <View style={styles.confirmActions}>
        <Pressable
          accessibilityRole="button"
          disabled={isBusy}
          onPress={onConfirm}
          style={({ pressed }) => [{ alignSelf: 'stretch' as const }, pressed ? styles.pressableDown : null]}
        >
          <View style={[styles.primaryButton, isBusy ? styles.primaryButtonDisabled : null]}>
            {isBusy ? (
              <ActivityIndicator color={swapDesignSpec.colors.bodyOnLightSubtle} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm Swap</Text>
            )}
          </View>
        </Pressable>
        <View style={styles.confirmFooterRow}>
          <Ionicons color={swapDesignSpec.colors.iconMuted} name="time-outline" size={14} />
          <Text style={styles.footerCaption}>Quote expires in {quoteCountdown}s</Text>
        </View>
      </View>
    </View>
  )
}

function ProgressItem({
  index,
  isLast = false,
  step,
  status,
}: {
  index: number
  isLast?: boolean
  status: 'active' | 'complete' | 'pending'
  step: SwapProgressStep
}) {
  const isComplete = status === 'complete'
  const isActive = status === 'active'

  return (
    <View style={[styles.progressRow, isLast ? styles.progressRowLast : null]}>
      <View
        style={[
          styles.progressBadge,
          isComplete ? styles.progressBadgeComplete : null,
          isActive ? styles.progressBadgeActive : null,
        ]}
      >
        {isComplete ? (
          <Ionicons color={swapDesignSpec.colors.iconOnLight} name="checkmark" size={12} />
        ) : isActive ? (
          <View style={[styles.statusDot, { backgroundColor: swapDesignSpec.colors.iconOnLight }]} />
        ) : (
          <Text style={styles.progressBadgeText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.progressCopy}>
        <Text
          style={[
            styles.progressTitle,
            isActive ? styles.progressTitleActive : null,
            status === 'pending' ? styles.progressTitlePending : null,
          ]}
        >
          {step.title}
        </Text>
        <Text style={[styles.progressDescription, status === 'pending' ? styles.progressDescriptionPending : null]}>
          {step.description}
        </Text>
      </View>
    </View>
  )
}

function ProcessingScreen({
  activeStepIndex,
  quote,
  steps,
}: {
  activeStepIndex: number
  quote: SwapQuotePreview | null
  steps: SwapProgressStep[]
}) {
  return (
    <View style={styles.processingRoot}>
      <View style={styles.processingHeroWrap}>
        <View style={[styles.resultHeroRing, { borderColor: swapDesignSpec.colors.resultHeroProcessingRing }]}>
          <View style={[styles.resultHeroInner, { backgroundColor: swapDesignSpec.colors.resultHeroProcessing }]}>
            <Ionicons color={swapDesignSpec.colors.iconOnLight} name="sync" size={24} />
          </View>
        </View>
        <View style={styles.processingHeroTextWrap}>
          <Text style={styles.processingTitle}>Swapping tokens</Text>
          {quote ? (
            <Text style={styles.processingSubtitle}>
              {formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} {quote.inputAsset.symbol} {'→'}{' '}
              {formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} {quote.outputAsset.symbol}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.progressCard}>
        {steps.map((step, index) => {
          const status = index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'active' : 'pending'
          return <ProgressItem key={step.id} index={index} isLast={index === steps.length - 1} status={status} step={step} />
        })}
      </View>

      <View style={styles.processingNotice}>
        <Ionicons color={swapDesignSpec.colors.progressNoticeText} name="information-circle-outline" size={14} />
        <Text style={styles.processingNoticeText}>
          Solana transactions usually confirm in under 1 second. Do not close this screen.
        </Text>
      </View>
    </View>
  )
}

function SuccessScreen({
  onBackToFeed,
  onCopyShare,
  onCopySignature,
  onViewReceipt,
  quote,
  result,
}: {
  onBackToFeed: () => void
  onCopyShare: () => void
  onCopySignature: () => void
  onViewReceipt?: () => void
  quote: SwapQuotePreview
  result: Extract<SwapResult, { kind: 'success' }>
}) {
  return (
    <View style={styles.resultStageBody}>
      <View style={styles.resultHero}>
        <View style={[styles.resultHeroRing, { borderColor: swapDesignSpec.colors.resultHeroSuccessRing }]}>
          <View style={[styles.resultHeroInner, { backgroundColor: swapDesignSpec.colors.resultHeroSuccess }]}>
            <Ionicons color={swapDesignSpec.colors.iconOnLight} name="checkmark" size={22} />
          </View>
        </View>
        <View style={styles.resultHeroTextWrap}>
          <Text style={styles.resultTitle}>Swap Complete!</Text>
          <Text style={styles.resultSubtitle}>Your {quote.outputAsset.symbol} tokens have been added to your wallet</Text>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="Sent" value={`-${formatAmount(result.sentAmount, result.sentSymbol)} ${result.sentSymbol}`} />
        <SummaryRow
          label="Received"
          value={`+${formatAmount(result.receivedAmount, result.receivedSymbol)} ${result.receivedSymbol}`}
          valueTone="success"
        />
        <SummaryRow dotColor={swapDesignSpec.colors.statusDotSuccess} label="Status" value={result.statusLabel} valueTone="success" />
        <Pressable accessibilityRole="button" onPress={onCopySignature} style={({ pressed }) => [styles.summaryRow, styles.summaryRowLast, pressed ? styles.pressableDown : null]}>
          <Text style={styles.summaryLabel}>TX Hash</Text>
          <View style={styles.txHashRow}>
            <Text style={styles.summaryValue}>{result.signature}</Text>
            <Ionicons color={swapDesignSpec.colors.iconSecondary} name="copy-outline" size={14} />
          </View>
        </Pressable>
      </View>

      <View style={styles.resultActions}>
        <SecondaryButton icon="share-social-outline" label="Share Trade" onPress={onCopyShare} />
        <PrimaryButton label="Back to Feed" onPress={onBackToFeed} />
        {onViewReceipt ? (
          <Pressable accessibilityRole="button" onPress={onViewReceipt} style={({ pressed }) => [pressed ? styles.pressableDown : null]}>
            <Text style={styles.textAction}>View in Activity</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function PendingScreen({
  onBackToFeed,
  onCopySignature,
  onRefreshStatus,
  onViewExplorer,
  result,
}: {
  onBackToFeed: () => void
  onCopySignature: () => void
  onRefreshStatus: () => void
  onViewExplorer: () => void
  result: Extract<SwapResult, { kind: 'pending' }>
}) {
  return (
    <View style={styles.resultStageBody}>
      <View style={styles.resultHero}>
        <View style={[styles.resultHeroRing, { borderColor: swapDesignSpec.colors.resultHeroPendingRing }]}>
          <View style={[styles.resultHeroInner, { backgroundColor: swapDesignSpec.colors.resultHeroPending }]}>
            <Ionicons color={swapDesignSpec.colors.iconOnLight} name="time-outline" size={24} />
          </View>
        </View>
        <View style={styles.resultHeroTextWrap}>
          <Text style={styles.resultTitle}>Awaiting Confirmation</Text>
          <Text style={styles.resultSubtitle}>{result.message}</Text>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow dotColor={swapDesignSpec.colors.statusDotPending} label="Status" value={result.statusLabel} valueTone="accent" />
        <SummaryRow label="Trade ID" value={result.tradeId} />
        <Pressable accessibilityRole="button" onPress={onCopySignature} style={({ pressed }) => [styles.summaryRow, styles.summaryRowLast, pressed ? styles.pressableDown : null]}>
          <Text style={styles.summaryLabel}>TX Hash</Text>
          <View style={styles.txHashRow}>
            <Text style={styles.summaryValue}>{result.signature}</Text>
            <Ionicons color={swapDesignSpec.colors.iconSecondary} name="copy-outline" size={14} />
          </View>
        </Pressable>
      </View>

      <View style={styles.resultActions}>
        <SecondaryButton icon="refresh" iconPosition="right" label="Refresh Status" onPress={onRefreshStatus} />
        <PrimaryButton label="Back to Feed" onPress={onBackToFeed} />
        <Pressable accessibilityRole="button" onPress={onViewExplorer} style={({ pressed }) => [pressed ? styles.pressableDown : null]}>
          <Text style={styles.textAction}>View on Explorer</Text>
        </Pressable>
      </View>
    </View>
  )
}

function DangerButton({
  icon,
  label,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.dangerButton, pressed ? styles.pressableDown : null]}>
      {icon ? <Ionicons color={swapDesignSpec.colors.heading} name={icon} size={16} /> : null}
      <Text style={styles.dangerButtonText}>{label}</Text>
    </Pressable>
  )
}

function FailureScreen({
  onAdjustSlippageAndRetry,
  onBackToFeed,
  onRetry,
  quote,
  result,
}: {
  onAdjustSlippageAndRetry: () => void
  onBackToFeed: () => void
  onRetry: () => void
  quote: SwapQuotePreview | null
  result: Extract<SwapResult, { kind: 'failure' }>
}) {
  return (
    <View style={styles.resultStageBody}>
      <View style={styles.resultHero}>
        <View style={[styles.resultHeroRing, { borderColor: swapDesignSpec.colors.resultHeroFailureRing }]}>
          <View style={[styles.resultHeroInner, { backgroundColor: swapDesignSpec.colors.resultHeroFailure }]}>
            <Ionicons color={swapDesignSpec.colors.iconOnLight} name="close" size={22} />
          </View>
        </View>
        <View style={styles.resultHeroTextWrap}>
          <Text style={styles.resultTitle}>Swap Failed</Text>
          <Text style={styles.resultSubtitle}>{result.message}</Text>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="Error" value={result.title} valueTone="danger" />
        <SummaryRow label="Attempted" value={quote ? `${quote.inputAsset.symbol} → ${quote.outputAsset.symbol}` : result.attemptedPathLabel} />
        <SummaryRow isLast label="Suggestion" value={result.suggestion} />
      </View>

      <View style={styles.resultActions}>
        <DangerButton icon="refresh" label="Try Again" onPress={onRetry} />
        {result.reason === 'slippage_exceeded' ? (
          <SecondaryButton icon="options-outline" label="Adjust Slippage & Retry" onPress={onAdjustSlippageAndRetry} tone="danger" />
        ) : null}
        <Pressable accessibilityRole="button" onPress={onBackToFeed} style={({ pressed }) => [pressed ? styles.pressableDown : null]}>
          <Text style={styles.textAction}>Back to Feed</Text>
        </Pressable>
      </View>
    </View>
  )
}

export interface SwapFlowModalProps {
  adapter?: SwapQuoteAdapter
  onClose: () => void
  onViewReceipt?: (result: SwapSuccessResult, quote: SwapQuotePreview) => void
  payload: SwapFlowPayload | null
}

export function SwapFlowModal({
  adapter = apiSwapQuoteAdapter,
  onClose,
  onViewReceipt,
  payload,
}: SwapFlowModalProps) {
  const { account, chain, signTransaction } = useMobileWallet()
  const { getExplorerUrl } = useNetwork()
  const { data: tokenBalances } = useAccountTokenBalances()
  const flowIdRef = useRef(0)
  const requestIdRef = useRef(0)
  const submitIdempotencyKeyRef = useRef(createSubmitIdempotencyKey())
  const [draft, setDraft] = useState<SwapDraft | null>(null)
  const [quote, setQuote] = useState<SwapQuotePreview | null>(null)
  const [stage, setStage] = useState<SwapStage>('entry')
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [executionResult, setExecutionResult] = useState<SwapResult | null>(null)
  const [executionSteps, setExecutionSteps] = useState<SwapProgressStep[]>([])
  const [activeProgressIndex, setActiveProgressIndex] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())
  const [quoteErrorMessage, setQuoteErrorMessage] = useState<string | null>(null)
  const stageRef = useRef<SwapStage>(stage)

  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  const walletAddress = useMemo(() => account?.address.toString() ?? null, [account])
  const chainSupported = isSwapChainSupported(chain)
  const activeAssetEnabled = draft ? isSwapAssetEnabled(draft.counterAssetSymbol) : true

  const inputWalletBalance = useMemo(() => {
    if (!tokenBalances || !draft) {
      return null
    }
    const inputSymbol = draft.side === 'buy' ? draft.counterAssetSymbol : draft.token.symbol
    const assetInfo = COUNTER_ASSET_MINTS[inputSymbol]
    const mint = draft.side === 'buy' ? assetInfo?.mint : draft.token.mint
    if (!mint) {
      return null
    }
    const rawAmount = tokenBalances[mint]
    if (rawAmount == null || rawAmount <= 0n) {
      return 0
    }
    const decimals = assetInfo?.decimals ?? 6
    return Number(rawAmount) / 10 ** decimals
  }, [tokenBalances, draft])

  useEffect(() => {
    if (!payload) {
      flowIdRef.current += 1
      requestIdRef.current += 1
      setDraft(null)
      setQuote(null)
      setExecutionResult(null)
      setExecutionSteps([])
      setActiveProgressIndex(0)
      setQuoteErrorMessage(null)
      setStage('entry')
      setIsQuoteLoading(false)
      setIsConfirming(false)
      submitIdempotencyKeyRef.current = createSubmitIdempotencyKey()
      return
    }

    flowIdRef.current += 1
    submitIdempotencyKeyRef.current = createSubmitIdempotencyKey()
    const nextDraft = createSwapDraft(payload)
    setDraft(nextDraft)
    setQuote(null)
    setExecutionResult(null)
    setExecutionSteps([])
    setActiveProgressIndex(0)
    setQuoteErrorMessage(null)
    setStage('entry')
    setIsConfirming(false)
  }, [payload])

  useEffect(() => {
    if (stage !== 'entry' && stage !== 'confirm') {
      return
    }

    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1_000)

    return () => clearInterval(timer)
  }, [stage])

  const requestQuote = useCallback(
    async (nextDraft: SwapDraft): Promise<SwapQuotePreview | null> => {
      if (!walletAddress) {
        setQuote(null)
        setQuoteErrorMessage('Connect your wallet to fetch a live swap quote.')
        if (stageRef.current === 'confirm') {
          setStage('entry')
        }
        return null
      }
      if (!chainSupported) {
        setQuote(null)
        setQuoteErrorMessage('Live swaps are only available when your wallet is on Mainnet.')
        if (stageRef.current === 'confirm') {
          setStage('entry')
        }
        return null
      }
      if (!isSwapAssetEnabled(nextDraft.counterAssetSymbol)) {
        setQuote(null)
        setQuoteErrorMessage(`${nextDraft.counterAssetSymbol} is not configured for live swaps yet.`)
        if (stageRef.current === 'confirm') {
          setStage('entry')
        }
        return null
      }
      if (!isDraftAmountComplete(nextDraft)) {
        setQuote(null)
        setQuoteErrorMessage(null)
        if (stageRef.current === 'confirm') {
          setStage('entry')
        }
        return null
      }

      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setIsQuoteLoading(true)

      try {
        const nextQuote = await adapter.getQuote({
          draft: nextDraft,
          walletAddress,
        })
        if (requestIdRef.current !== requestId) {
          return null
        }

        const enriched = enrichQuoteTokenImage(nextQuote, nextDraft)
        setQuote(enriched)
        setQuoteErrorMessage(null)
        return enriched
      } catch (error) {
        if (requestIdRef.current === requestId) {
          setQuote(null)
          setQuoteErrorMessage(error instanceof Error ? error.message : 'Unable to fetch a live swap quote.')
          if (stageRef.current === 'confirm') {
            setStage('entry')
          }
        }
        return null
      } finally {
        if (requestIdRef.current === requestId) {
          setIsQuoteLoading(false)
        }
      }
    },
    [adapter, chainSupported, walletAddress],
  )

  useEffect(() => {
    if (!draft || (stage !== 'entry' && stage !== 'confirm')) {
      return
    }

    void requestQuote(draft)
  }, [draft, requestQuote, stage])

  useEffect(() => {
    if (!draft || !quote || (stage !== 'entry' && stage !== 'confirm')) {
      return
    }

    const timer = setInterval(() => {
      const expiresAtMs = new Date(quote.expiresAt).getTime()
      if (Date.now() >= expiresAtMs && !isQuoteLoading) {
        void requestQuote(draft)
      }
    }, 1_000)

    return () => clearInterval(timer)
  }, [draft, isQuoteLoading, quote, requestQuote, stage])

  const updateDraft = useCallback((updater: (current: SwapDraft) => SwapDraft) => {
    setDraft((current) => (current ? updater(current) : current))
  }, [])

  const handleCycleCounterAsset = useCallback(() => {
    updateDraft((current) => {
      const options = getCounterAssetOptions()
      const currentIndex = options.findIndex((option) => option.symbol === current.counterAssetSymbol)
      const nextOption = options[(currentIndex + 1 + options.length) % options.length]
      triggerSelectionHaptic()
      return {
        ...current,
        counterAssetSymbol: nextOption.symbol as SwapDraft['counterAssetSymbol'],
      }
    })
  }, [updateDraft])

  const handleAmountTextChange = useCallback(
    (nextValue: string) => {
      updateDraft((current) => {
        const amountText = sanitizeDraftAmount(nextValue)
        return {
          ...current,
          amount: parseAmountInput(amountText),
          amountText,
        }
      })
    },
    [updateDraft],
  )

  const runExecution = useCallback(
    async (nextDraft: SwapDraft, reviewedQuote: SwapQuotePreview | null) => {
      if (!walletAddress) {
        setExecutionResult(
          createFailureResult({
            attemptedPathLabel: `${nextDraft.counterAssetSymbol} -> ${nextDraft.token.symbol}`,
            message: 'Connect your wallet before confirming the swap.',
            suggestion: 'Reconnect your wallet and try again.',
            title: 'Wallet required',
          }),
        )
        setStage('failure')
        return
      }
      if (!chainSupported) {
        setExecutionResult(
          createFailureResult({
            attemptedPathLabel: `${nextDraft.counterAssetSymbol} -> ${nextDraft.token.symbol}`,
            message: 'Live swaps are only available when your wallet is on Mainnet.',
            suggestion: 'Switch your wallet cluster to Mainnet and try again.',
            title: 'Unsupported network',
          }),
        )
        setStage('failure')
        return
      }
      if (!activeAssetEnabled) {
        setExecutionResult(
          createFailureResult({
            attemptedPathLabel: `${nextDraft.counterAssetSymbol} -> ${nextDraft.token.symbol}`,
            message: `${nextDraft.counterAssetSymbol} is not configured for live swaps yet.`,
            suggestion: 'Choose a different pay asset and try again.',
            title: 'Asset unavailable',
          }),
        )
        setStage('failure')
        return
      }
      if (!reviewedQuote || isQuoteExpired(reviewedQuote)) {
        setExecutionResult(null)
        setStage('entry')
        return
      }

      const flowId = flowIdRef.current
      let didStartSubmit = false
      let submittedTrade: { signature: string; tradeId: string } | null = null
      setIsConfirming(true)
      setStage('processing')
      setExecutionSteps(LIVE_PROCESSING_STEPS)
      setExecutionResult(null)
      setActiveProgressIndex(0)
      setQuoteErrorMessage(null)

      try {
        const executionDraft = {
          ...nextDraft,
          attemptCount: nextDraft.attemptCount + 1,
        }
        setDraft(executionDraft)
        setActiveProgressIndex(1)

        const buildResponse = await adapter.buildTrade({
          quoteId: reviewedQuote.quoteId,
          walletAddress,
        })
        if (flowIdRef.current !== flowId) {
          return
        }

        const unsignedTransaction = getTransactionDecoder().decode(Base64.toUint8Array(buildResponse.unsignedTxBase64))
        const signedTransaction = await signTransaction(unsignedTransaction)
        if (flowIdRef.current !== flowId) {
          return
        }

        setActiveProgressIndex(2)
        didStartSubmit = true
        const submitResponse = await adapter.submitTrade({
          idempotencyKey: submitIdempotencyKeyRef.current,
          signedTxBase64: getBase64EncodedWireTransaction(signedTransaction),
          tradeIntentId: buildResponse.tradeIntentId,
        })
        if (flowIdRef.current !== flowId) {
          return
        }

        submittedTrade = {
          signature: submitResponse.signature,
          tradeId: submitResponse.tradeId,
        }
        setActiveProgressIndex(3)
        const startedAt = Date.now()
        let latestStatus = await adapter.getTradeStatus(submitResponse.tradeId)
        while (
          flowIdRef.current === flowId &&
          latestStatus.status !== 'confirmed' &&
          latestStatus.status !== 'failed' &&
          Date.now() - startedAt < STATUS_POLL_TIMEOUT_MS
        ) {
          await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS))
          latestStatus = await adapter.getTradeStatus(submitResponse.tradeId)
        }

        if (flowIdRef.current !== flowId) {
          return
        }

        if (latestStatus.status === 'confirmed') {
          setExecutionResult({
            kind: 'success',
            receivedAmount: reviewedQuote.outputAsset.amount,
            receivedSymbol: reviewedQuote.outputAsset.symbol,
            sentAmount: reviewedQuote.inputAsset.amount,
            sentSymbol: reviewedQuote.inputAsset.symbol,
            shareText: `Swapped ${formatAmount(reviewedQuote.inputAsset.amount, reviewedQuote.inputAsset.symbol)} ${reviewedQuote.inputAsset.symbol} for ${formatAmount(reviewedQuote.outputAsset.amount, reviewedQuote.outputAsset.symbol)} ${reviewedQuote.outputAsset.symbol} on ReelFlip.`,
            signature: latestStatus.signature ?? submitResponse.signature,
            statusLabel: 'Confirmed',
            tradeId: submitResponse.tradeId,
          })
          setStage('success')
          return
        }

        if (latestStatus.status === 'failed') {
          setExecutionResult(
            createFailureResult({
              attemptedPathLabel: `${reviewedQuote.inputAsset.symbol} -> ${reviewedQuote.outputAsset.symbol}`,
              ...(latestStatus.failureCode ? { failureCode: latestStatus.failureCode } : {}),
              message: latestStatus.failureMessage ?? 'The transaction could not be completed. No funds were deducted.',
              reason: latestStatus.failureCode === 'SIMULATION_FAILED' ? 'slippage_exceeded' : 'routing_unavailable',
              suggestion:
                latestStatus.failureCode === 'SIMULATION_FAILED'
                  ? 'Increase slippage tolerance and try again.'
                  : latestStatus.failureCode === 'QUOTE_EXPIRED'
                    ? 'Refresh the quote and retry the swap.'
                    : 'Wait a moment, then retry the swap.',
              title: latestStatus.failureCode === 'QUOTE_EXPIRED' ? 'Quote expired' : 'Swap failed',
            }),
          )
          setStage('failure')
          return
        }

        setExecutionResult(createPendingResult(submitResponse.tradeId, latestStatus.signature ?? submitResponse.signature))
        setStage('pending')
      } catch (error) {
        if (flowIdRef.current !== flowId) {
          return
        }

        if (submittedTrade) {
          setExecutionResult(
            createPendingResult(submittedTrade.tradeId, submittedTrade.signature, {
              message: 'The transaction was submitted, but we could not refresh its status right now.',
              statusLabel: 'Status refresh unavailable',
            }),
          )
          setStage('pending')
          return
        }
        if (didStartSubmit) {
          setExecutionResult(
            createFailureResult({
              attemptedPathLabel: `${reviewedQuote.inputAsset.symbol} -> ${reviewedQuote.outputAsset.symbol}`,
              failureCode: 'STATUS_TIMEOUT',
              message: 'We could not confirm whether the submit request completed. Retry will reuse the same request safely.',
              suggestion: 'Retry to resume this submission, or wait a moment and try again.',
              title: 'Submission status unknown',
            }),
          )
          setStage('failure')
          return
        }

        const message = error instanceof Error ? error.message : 'Swap execution failed.'
        const lowered = message.toLowerCase()
        const title =
          lowered.includes('reject') || lowered.includes('declin') || lowered.includes('cancel')
            ? 'Wallet approval rejected'
            : lowered.includes('quote')
              ? 'Quote expired'
              : 'Swap failed'
        setExecutionResult(
          createFailureResult({
            attemptedPathLabel: `${nextDraft.counterAssetSymbol} -> ${nextDraft.token.symbol}`,
            message,
            suggestion:
              title === 'Quote expired'
                ? 'Refresh the quote and retry.'
                : title === 'Wallet approval rejected'
                  ? 'Approve the transaction in your wallet to continue.'
                  : 'Try again in a few seconds.',
            title,
          }),
        )
        setStage('failure')
      } finally {
        if (flowIdRef.current === flowId) {
          setIsConfirming(false)
        }
      }
    },
    [activeAssetEnabled, adapter, chainSupported, signTransaction, walletAddress],
  )

  const handleContinueToConfirm = useCallback(() => {
    if (!quote || !draft || draft.amount <= 0 || isQuoteLoading || quoteErrorMessage) {
      return
    }

    setStage('confirm')
    triggerImpactHaptic()
  }, [draft, isQuoteLoading, quote, quoteErrorMessage])

  const handleConfirm = useCallback(() => {
    if (!draft || !quote) {
      return
    }

    void runExecution(draft, quote)
  }, [draft, quote, runExecution])

  const handleRetry = useCallback(() => {
    if (!draft || !quote) {
      return
    }

    if (executionResult?.kind === 'failure' && executionResult.failureCode !== 'STATUS_TIMEOUT') {
      submitIdempotencyKeyRef.current = createSubmitIdempotencyKey()
    }

    void runExecution(draft, quote)
  }, [draft, executionResult, quote, runExecution])

  const handleAdjustSlippageAndRetry = useCallback(() => {
    if (!draft) {
      return
    }

    const nextDraft = {
      ...draft,
      slippageBps: Math.max(draft.slippageBps, 100),
    }
    submitIdempotencyKeyRef.current = createSubmitIdempotencyKey()
    setDraft(nextDraft)
    setExecutionResult(null)
    setStage('entry')
  }, [draft])

  const handleBackToEntry = useCallback(() => {
    setStage('entry')
    triggerSelectionHaptic()
  }, [])

  const handleBackToFeed = useCallback(() => {
    onClose()
  }, [onClose])

  const handleViewExplorer = useCallback(async () => {
    const signature =
      executionResult?.kind === 'success' || executionResult?.kind === 'pending'
        ? executionResult.signature
        : null
    if (!signature) {
      return
    }

    await Linking.openURL(getExplorerUrl(`/tx/${signature}`))
  }, [executionResult, getExplorerUrl])

  const handleCopyShare = useCallback(() => {
    if (executionResult?.kind !== 'success') {
      return
    }

    Clipboard.setString(executionResult.shareText)
    triggerImpactHaptic()
  }, [executionResult])

  const handleCopySignature = useCallback(() => {
    if (executionResult?.kind !== 'success' && executionResult?.kind !== 'pending') {
      return
    }

    Clipboard.setString(executionResult.signature)
    triggerSelectionHaptic()
  }, [executionResult])

  const handleViewReceipt = useCallback(() => {
    if (!onViewReceipt || executionResult?.kind !== 'success' || !quote) {
      return
    }

    onViewReceipt(executionResult, quote)
  }, [executionResult, onViewReceipt, quote])

  const handleRefreshPending = useCallback(async () => {
    if (executionResult?.kind !== 'pending') {
      return
    }

    try {
      setIsConfirming(true)
      const status = await adapter.getTradeStatus(executionResult.tradeId)
      if (status.status === 'confirmed' && quote) {
        setExecutionResult({
          kind: 'success',
          receivedAmount: quote.outputAsset.amount,
          receivedSymbol: quote.outputAsset.symbol,
          sentAmount: quote.inputAsset.amount,
          sentSymbol: quote.inputAsset.symbol,
          shareText: `Swapped ${formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} ${quote.inputAsset.symbol} for ${formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} ${quote.outputAsset.symbol} on ReelFlip.`,
          signature: status.signature ?? executionResult.signature,
          statusLabel: 'Confirmed',
          tradeId: status.tradeId,
        })
        setStage('success')
        return
      }
      if (status.status === 'failed') {
        setExecutionResult(
          createFailureResult({
            attemptedPathLabel: quote ? `${quote.inputAsset.symbol} -> ${quote.outputAsset.symbol}` : executionResult.tradeId,
            ...(status.failureCode ? { failureCode: status.failureCode } : {}),
            message: status.failureMessage ?? 'The transaction failed on-chain.',
            suggestion: 'Retry the swap if the transaction did not settle.',
            title: 'Swap failed',
          }),
        )
        setStage('failure')
        return
      }
      setExecutionResult(createPendingResult(status.tradeId, status.signature ?? executionResult.signature))
      setStage('pending')
    } catch (error) {
      setExecutionResult(
        createPendingResult(executionResult.tradeId, executionResult.signature, {
          message: error instanceof Error ? error.message : 'Unable to refresh trade status right now. Try again shortly.',
          statusLabel: 'Refresh failed',
        }),
      )
      setStage('pending')
    } finally {
      setIsConfirming(false)
    }
  }, [adapter, executionResult, quote])

  if (!payload || !draft) {
    return null
  }

  const stageTitle = getStageTitle(stage)
  const shouldShowClose =
    stage === 'entry' || stage === 'confirm' || stage === 'success' || stage === 'failure' || stage === 'pending'
  const entryFooterMessage =
    quoteErrorMessage ??
    (!walletAddress
      ? 'Connect your wallet to fetch a live quote.'
      : !chainSupported
        ? 'Switch your wallet to Mainnet to enable live swaps.'
        : !activeAssetEnabled
          ? `${draft.counterAssetSymbol} is not configured for live swaps yet.`
          : null)
  const canContinue =
    Boolean(quote && draft.amount > 0) &&
    Boolean(walletAddress) &&
    chainSupported &&
    activeAssetEnabled &&
    !quoteErrorMessage &&
    !isQuoteLoading

  return (
    <Modal
      animationType="slide"
      onRequestClose={shouldShowClose ? onClose : undefined}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible={Boolean(payload)}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.modalRoot}>
        <View style={styles.header}>
          {stage === 'processing' ? (
            <View style={styles.headerSpacer} />
          ) : (
            <Pressable
              accessibilityLabel={stage === 'confirm' ? 'Back to swap entry' : 'Close swap flow'}
              accessibilityRole="button"
              onPress={stage === 'confirm' ? handleBackToEntry : onClose}
              style={({ pressed }) => [pressed ? styles.pressableDown : null]}
            >
              <Ionicons color={swapDesignSpec.colors.iconPrimary} name="chevron-back" size={22} />
            </Pressable>
          )}
          <Text style={[styles.headerTitle, stage === 'processing' ? styles.headerTitleCentered : null]}>{stageTitle}</Text>
          {stage === 'entry' ? (
            <SlippagePill slippageBps={draft.slippageBps} />
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {stage === 'entry' ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <EntryScreen
              draft={draft}
              canContinue={canContinue}
              footerMessage={entryFooterMessage}
              isQuoteLoading={isQuoteLoading}
              nowMs={nowMs}
              onAmountTextChange={handleAmountTextChange}
              onContinue={handleContinueToConfirm}
              onCycleCounterAsset={handleCycleCounterAsset}
              quote={quote}
              walletBalance={inputWalletBalance}
            />
          </ScrollView>
        ) : null}

        {stage === 'confirm' && quote ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <ConfirmScreen
              isBusy={isConfirming}
              nowMs={nowMs}
              onConfirm={handleConfirm}
              quote={quote}
            />
          </ScrollView>
        ) : null}

        {stage === 'processing' ? <ProcessingScreen activeStepIndex={activeProgressIndex} quote={quote} steps={executionSteps} /> : null}

        {stage === 'success' && quote && executionResult?.kind === 'success' ? (
          <SuccessScreen
            onBackToFeed={handleBackToFeed}
            onCopyShare={handleCopyShare}
            onCopySignature={handleCopySignature}
            onViewReceipt={onViewReceipt ? handleViewReceipt : undefined}
            quote={quote}
            result={executionResult}
          />
        ) : null}

        {stage === 'pending' && executionResult?.kind === 'pending' ? (
          <PendingScreen
            onBackToFeed={handleBackToFeed}
            onCopySignature={handleCopySignature}
            onRefreshStatus={() => void handleRefreshPending()}
            onViewExplorer={() => void handleViewExplorer()}
            result={executionResult}
          />
        ) : null}

        {stage === 'failure' && executionResult?.kind === 'failure' ? (
          <FailureScreen
            onAdjustSlippageAndRetry={handleAdjustSlippageAndRetry}
            onBackToFeed={handleBackToFeed}
            onRetry={handleRetry}
            quote={quote}
            result={executionResult}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

export interface FeedInteractionOverlaysProps {
  actionPayload: FeedPlaceholderSheetPayload | null
  onCloseActionSheet: () => void
  onCloseSwapFlow: () => void
  onViewReceipt?: (result: SwapSuccessResult, quote: SwapQuotePreview) => void
  swapPayload: SwapFlowPayload | null
}

export function FeedInteractionOverlays({
  actionPayload,
  onCloseActionSheet,
  onCloseSwapFlow,
  onViewReceipt,
  swapPayload,
}: FeedInteractionOverlaysProps) {
  return (
    <>
      <FeedPlaceholderSheet onClose={onCloseActionSheet} payload={actionPayload} />
      <SwapFlowModal onClose={onCloseSwapFlow} onViewReceipt={onViewReceipt} payload={swapPayload} />
    </>
  )
}

const styles = StyleSheet.create({
  amountInput: {
    color: swapDesignSpec.colors.heading,
    flex: 1,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 36,
    letterSpacing: -1.08,
    lineHeight: 44,
    padding: 0,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  amountSubtext: {
    color: swapDesignSpec.colors.cardSecondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
  },
  assetPill: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.pillBackground,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  assetPillBadge: {
    alignItems: 'center',
    borderRadius: 16,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  assetPillBadgeText: {
    color: swapDesignSpec.colors.bodyOnLight,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 12,
  },
  assetPillImage: {
    borderRadius: 14,
    height: 28,
    width: 28,
  },
  assetPillLabel: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 18,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: swapDesignSpec.colors.bodyOnLight,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 18,
  },
  avatarImage: {
    backgroundColor: swapDesignSpec.colors.panelBackground,
    borderRadius: 999,
  },
  cardsSection: {
    gap: 8,
    position: 'relative' as const,
  },
  cardBalance: {
    color: swapDesignSpec.colors.cardSecondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  cardEyebrow: {
    color: swapDesignSpec.colors.eyebrowText,
    fontFamily: spaceGroteskFamily.medium,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chip: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.chipBackground,
    borderColor: swapDesignSpec.colors.chipBorder,
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipDanger: {
    backgroundColor: swapDesignSpec.colors.chipDangerBackground,
    borderColor: swapDesignSpec.colors.chipDangerBorder,
  },
  chipSelected: {
    backgroundColor: swapDesignSpec.colors.chipSelectedBackground,
    borderColor: swapDesignSpec.colors.chipSelectedBorder,
  },
  chipText: {
    color: swapDesignSpec.colors.accentSoft,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 15,
  },
  chipTextSelected: {
    color: swapDesignSpec.colors.accentTint,
  },
  confirmActions: {
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    paddingBottom: 4,
  },
  confirmHero: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 36,
  },
  confirmFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  confirmHeroAmount: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 24,
    marginTop: 12,
  },
  confirmHeroSymbol: {
    color: swapDesignSpec.colors.bodyMuted,
    fontFamily: spaceGroteskFamily.medium,
    fontSize: 18,
    marginTop: 4,
  },
  confirmTokenBlock: {
    alignItems: 'center',
    minWidth: 120,
  },
  entryBody: {
    flex: 1,
    gap: 8,
  },
  entryFooter: {
    gap: 10,
    marginTop: 'auto',
  },
  entryFooterQuote: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  failureCard: {
    // No tinted background — use standard card
  },
  footerCaption: {
    color: swapDesignSpec.colors.cardSecondaryText,
    fontFamily: interFontFamily.regular,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    color: swapDesignSpec.colors.heading,
    flex: 1,
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: 17,
    letterSpacing: -0.34,
    lineHeight: 22,
    textAlign: 'left',
  },
  headerTitleCentered: {
    textAlign: 'center',
  },
  metricsCard: {
    backgroundColor: swapDesignSpec.colors.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 0,
  },
  modalRoot: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  pressableDown: {
    opacity: 0.85,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.ctaBackground,
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: swapDesignSpec.colors.bodyOnLightSubtle,
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.16,
    lineHeight: 20,
    textAlign: 'center',
  },
  processingCopy: {
    gap: 8,
  },
  processingHeroWrap: {
    alignItems: 'center',
    gap: 20,
    paddingTop: 32,
  },
  processingHeroTextWrap: {
    alignItems: 'center',
    gap: 6,
  },
  processingNotice: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto',
    paddingHorizontal: 4,
    paddingBottom: 36,
  },
  processingNoticeText: {
    color: swapDesignSpec.colors.progressNoticeText,
    flex: 1,
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  processingRoot: {
    flex: 1,
    paddingHorizontal: 16,
  },
  processingSubtitle: {
    color: swapDesignSpec.colors.resultSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  processingTitle: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 24,
    letterSpacing: -0.72,
    lineHeight: 30,
    textAlign: 'center',
  },
  progressBadge: {
    alignItems: 'center',
    borderColor: swapDesignSpec.colors.secondaryOutlineBorder,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  progressBadgeActive: {
    backgroundColor: swapDesignSpec.colors.progressActiveBackground,
    borderWidth: 0,
  },
  progressBadgeComplete: {
    backgroundColor: swapDesignSpec.colors.progressCompleteBackground,
    borderWidth: 0,
  },
  progressBadgeText: {
    color: swapDesignSpec.colors.progressTitlePending,
    fontFamily: interFontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  progressCard: {
    backgroundColor: swapDesignSpec.colors.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  progressCopy: {
    flex: 1,
    gap: 2,
  },
  progressDescription: {
    color: swapDesignSpec.colors.progressDescDefault,
    fontFamily: interFontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  progressDescriptionPending: {
    color: swapDesignSpec.colors.progressDescPending,
  },
  progressRow: {
    alignItems: 'center',
    borderBottomColor: swapDesignSpec.colors.summaryRowDivider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  progressRowLast: {
    borderBottomWidth: 0,
  },
  progressRowActive: {},
  progressTitle: {
    color: swapDesignSpec.colors.heading,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  progressTitleActive: {
    color: swapDesignSpec.colors.progressTitleActive,
  },
  progressTitlePending: {
    color: swapDesignSpec.colors.progressTitlePending,
  },
  quoteCard: {
    backgroundColor: swapDesignSpec.colors.cardBackground,
    borderRadius: 16,
    gap: 14,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  quoteRefreshDot: {
    backgroundColor: swapDesignSpec.colors.quoteRefreshDot,
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  receiveAmount: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 36,
    lineHeight: 44,
  },
  resultActions: {
    gap: 10,
    marginTop: 'auto',
    paddingBottom: 28,
  },
  resultHero: {
    alignItems: 'center',
    gap: 20,
    paddingBottom: 36,
    paddingTop: 36,
  },
  resultHeroTextWrap: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
  },
  resultHeroRing: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 3,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  resultHeroInner: {
    alignItems: 'center',
    borderRadius: 999,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  resultStageBody: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resultSubtitle: {
    color: swapDesignSpec.colors.resultSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultTitle: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.bold,
    fontSize: 24,
    letterSpacing: -0.72,
    lineHeight: 30,
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: swapDesignSpec.colors.secondaryOutlineBorder,
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  secondaryButtonDanger: {
    backgroundColor: swapDesignSpec.colors.cardBackground,
    borderColor: swapDesignSpec.colors.cardBackground,
  },
  secondaryButtonText: {
    color: swapDesignSpec.colors.secondaryOutlineText,
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: 15,
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.dangerButtonBackground,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  dangerButtonText: {
    color: swapDesignSpec.colors.heading,
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: 16,
    letterSpacing: -0.16,
  },
  sliderThumb: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.processingInnerRing,
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    left: 6,
    position: 'absolute',
    top: 6,
    width: 52,
  },
  sliderTrack: {
    backgroundColor: swapDesignSpec.colors.sliderTrackBackground,
    borderColor: swapDesignSpec.colors.sliderTrackBorder,
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sliderTrackDisabled: {
    opacity: 0.72,
  },
  sliderTrackGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  sliderTrackLabel: {
    color: swapDesignSpec.colors.sliderLabel,
    fontFamily: spaceGroteskFamily.semiBold,
    fontSize: 22,
    paddingLeft: 88,
    textAlign: 'center',
  },
  sliderTrackLabelBusy: {
    paddingLeft: 72,
  },
  slippagePill: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.pillBackground,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  slippagePillText: {
    color: swapDesignSpec.colors.bodyMuted,
    fontFamily: spaceGroteskFamily.medium,
    fontSize: 13,
  },
  stageBody: {
    flex: 1,
    gap: 16,
  },
  statusDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  summaryLabel: {
    color: swapDesignSpec.colors.eyebrowText,
    fontFamily: interFontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
  },
  summaryRow: {
    alignItems: 'center',
    borderBottomColor: swapDesignSpec.colors.summaryRowDivider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryValue: {
    color: swapDesignSpec.colors.summaryValueDefault,
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    flexShrink: 1,
    lineHeight: 16,
    textAlign: 'right',
  },
  summaryValueAccent: {
    color: swapDesignSpec.colors.accentSoft,
  },
  summaryValueDanger: {
    color: swapDesignSpec.colors.resultHeroFailure,
  },
  summaryValueMuted: {
    color: swapDesignSpec.colors.bodyMuted,
  },
  summaryValueSuccess: {
    color: swapDesignSpec.colors.resultHeroSuccess,
  },
  summaryValueWithDot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  swapDirectionBadge: {
    alignItems: 'center',
    left: 0,
    marginTop: -21,
    position: 'absolute',
    right: 0,
    top: '50%',
    zIndex: 1,
  },
  swapDirectionCircle: {
    alignItems: 'center',
    backgroundColor: swapDesignSpec.colors.pillBackground,
    borderColor: swapDesignSpec.colors.cardBackground,
    borderRadius: 999,
    borderWidth: 3,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  textAction: {
    color: swapDesignSpec.colors.textActionMuted,
    fontFamily: interFontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
    paddingTop: 4,
    textAlign: 'center',
  },
  txHashRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
})
