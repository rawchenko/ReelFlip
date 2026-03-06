import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'
import { FeedPlaceholderSheet, FeedPlaceholderSheetPayload } from '@/features/feed/feed-placeholder-sheet'
import {
  buildMockQuote,
  clampSlippageBps,
  createSwapDraft,
  getCounterAssetOptions,
  mockSwapQuoteAdapter,
  normalizeAmountInput,
  parseAmountInput,
} from '@/features/swap/mock-swap'
import type {
  SwapDraft,
  SwapFlowPayload,
  SwapProgressStep,
  SwapQuoteAdapter,
  SwapQuotePreview,
  SwapResult,
} from '@/features/swap/types'
import Clipboard from '@react-native-clipboard/clipboard'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
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

type SwapStage = 'entry' | 'confirm' | 'processing' | 'success' | 'failure'

const ENTRY_PRESET_USD_VALUES = [25, 50, 100, 200]
const SLIPPAGE_CHIPS = [50, 100, 200]

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

function getStageTitle(stage: SwapStage, draft: SwapDraft | null): string {
  if (!draft) {
    return 'Swap'
  }

  if (stage === 'entry') {
    return `${draft.side === 'buy' ? 'Buy' : 'Sell'} $${draft.token.symbol}`
  }

  if (stage === 'confirm') {
    return 'Confirm Swap'
  }

  if (stage === 'processing') {
    return 'Processing Swap'
  }

  return stage === 'success' ? 'Swap Complete' : 'Swap Failed'
}

function buildPresetAmountValue(draft: SwapDraft, usdValue: number): number {
  if (draft.side === 'buy') {
    return usdValue
  }

  const tokenPrice = draft.token.priceUsd > 0 ? draft.token.priceUsd : 0.01
  return usdValue / tokenPrice
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

  if (normalizedImageUri) {
    return <Image source={{ uri: normalizedImageUri }} style={[styles.avatarImage, { height: size, width: size }]} />
  }

  return (
    <View style={[styles.avatarFallback, { backgroundColor: badgeColor, height: size, width: size }]}>
      <Text style={styles.avatarFallbackText}>{badgeText}</Text>
    </View>
  )
}

function SummaryRow({
  label,
  value,
  valueTone = 'default',
}: {
  label: string
  value: string
  valueTone?: 'default' | 'accent' | 'muted' | 'danger'
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          valueTone === 'accent' ? styles.summaryValueAccent : null,
          valueTone === 'muted' ? styles.summaryValueMuted : null,
          valueTone === 'danger' ? styles.summaryValueDanger : null,
        ]}
      >
        {value}
      </Text>
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
  label,
  onPress,
}: {
  badgeColor: string
  badgeText: string
  chevron?: boolean
  label: string
  onPress?: () => void
}) {
  const content = (
    <View style={styles.assetPill}>
      <View style={[styles.assetPillBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.assetPillBadgeText}>{badgeText}</Text>
      </View>
      <Text style={styles.assetPillLabel}>{label}</Text>
      {chevron ? <Ionicons color="#FFFFFF" name="chevron-down" size={16} /> : null}
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
      <LinearGradient colors={['rgba(250, 204, 21, 0.18)', 'rgba(250, 204, 21, 0.04)']} style={styles.sliderTrackGlow} />
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
        {isBusy ? <ActivityIndicator color="#000000" size="small" /> : <Ionicons color="#000000" name="arrow-forward" size={22} />}
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
      <LinearGradient colors={['#E8DB00', '#FFF433']} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

function SecondaryButton({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon?: keyof typeof Ionicons.glyphMap
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
      {icon ? <Ionicons color="#FFFFFF" name={icon} size={18} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function EntryScreen({
  draft,
  isQuoteLoading,
  nowMs,
  onAmountTextChange,
  onContinue,
  onCycleCounterAsset,
  onPresetSelect,
  onSlippageSelect,
  quote,
}: {
  draft: SwapDraft
  isQuoteLoading: boolean
  nowMs: number
  onAmountTextChange: (nextValue: string) => void
  onContinue: () => void
  onCycleCounterAsset: () => void
  onPresetSelect: (usdValue: number) => void
  onSlippageSelect: (slippageBps: number) => void
  quote: SwapQuotePreview | null
}) {
  const canContinue = Boolean(quote && draft.amount > 0)
  const canCycleOnPayCard = draft.side === 'buy'
  const inputAsset = quote?.inputAsset
  const outputAsset = quote?.outputAsset
  const quoteCountdown =
    quote
      ? Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - nowMs) / 1_000))
      : 0

  return (
    <View style={styles.stageBody}>
      <View style={styles.tokenSummary}>
        <Avatar badgeColor="#FACC15" badgeText={draft.token.symbol.slice(0, 1).toUpperCase()} imageUri={draft.token.imageUri} size={54} />
        <View style={styles.tokenSummaryCopy}>
          <View style={styles.tokenSummaryHeadingRow}>
            <Text style={styles.tokenSummarySymbol}>{draft.token.symbol}</Text>
            <View style={styles.labelBadge}>
              <Text style={styles.labelBadgeText}>Trending</Text>
            </View>
          </View>
          <Text style={styles.tokenSummaryMeta}>
            {formatCurrency(draft.token.priceUsd)} · M.Cap {formatCurrency(draft.token.marketCap ?? 0)}
          </Text>
        </View>
      </View>

      <View style={styles.quoteCard}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEyebrow}>YOU PAY</Text>
          <Text style={styles.cardBalance}>
            Balance: {formatAmount(inputAsset?.balance ?? 0, inputAsset?.symbol)} {inputAsset?.symbol ?? draft.counterAssetSymbol}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <TextInput
            accessibilityLabel="Swap amount"
            keyboardType="decimal-pad"
            onChangeText={onAmountTextChange}
            placeholder="0"
            placeholderTextColor="rgba(255, 255, 255, 0.18)"
            selectionColor="#E8DB00"
            style={styles.amountInput}
            value={draft.amountText}
          />
          {inputAsset ? (
            <AssetPill
              badgeColor={inputAsset.badgeColor}
              badgeText={inputAsset.badgeText}
              chevron={canCycleOnPayCard}
              label={inputAsset.symbol}
              onPress={canCycleOnPayCard ? onCycleCounterAsset : undefined}
            />
          ) : null}
        </View>
        <Text style={styles.amountSubtext}>≈ {formatCurrency(inputAsset?.usdValue ?? 0)}</Text>
      </View>

      <View style={styles.presetRow}>
        {ENTRY_PRESET_USD_VALUES.map((value) => {
          const presetAmount = buildPresetAmountValue(draft, value)
          const selected = Math.abs(draft.amount - presetAmount) < 0.01
          return <Chip key={value} label={`$${value}`} onPress={() => onPresetSelect(value)} selected={selected} />
        })}
      </View>

      <View style={styles.swapDirectionBadge}>
        <Ionicons color="#9CA3AF" name="swap-vertical" size={18} />
      </View>

      <View style={[styles.quoteCard, styles.quoteCardReceive]}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEyebrow}>YOU RECEIVE</Text>
          <Text style={styles.cardBalance}>Min {formatAmount(quote?.minimumReceived ?? 0, outputAsset?.symbol)}</Text>
        </View>
        <View style={styles.amountRow}>
          <View>
            <Text style={styles.receiveAmount}>{formatAmount(outputAsset?.amount ?? 0, outputAsset?.symbol)}</Text>
            <Text style={styles.amountSubtext}>≈ {formatCurrency(outputAsset?.usdValue ?? 0)}</Text>
          </View>
          {outputAsset ? (
            <AssetPill
              badgeColor={outputAsset.badgeColor}
              badgeText={outputAsset.badgeText}
              chevron={!canCycleOnPayCard}
              label={outputAsset.symbol}
              onPress={!canCycleOnPayCard ? onCycleCounterAsset : undefined}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow
          label="Rate"
          value={
            quote
              ? `1 ${quote.inputAsset.symbol} ≈ ${formatAmount(quote.exchangeRate, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`
              : '--'
          }
        />
        <SummaryRow label="Fees" value={quote ? formatCurrency(quote.platformFeeUsd) : '--'} />
        <SummaryRow label="Slippage" value={formatSlippage(draft.slippageBps)} />
        <SummaryRow
          label="Price Impact"
          value={quote ? `${quote.priceImpactPct.toFixed(2)}% ${getImpactLabel(quote.priceImpactPct)}` : '--'}
          valueTone="accent"
        />
      </View>

      <View style={styles.slippageChipsRow}>
        {SLIPPAGE_CHIPS.map((slippageBps) => (
          <Chip
            key={slippageBps}
            label={formatSlippage(slippageBps)}
            onPress={() => onSlippageSelect(slippageBps)}
            selected={draft.slippageBps === slippageBps}
          />
        ))}
      </View>

      <View style={styles.entryFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={!canContinue}
          onPress={onContinue}
          style={({ pressed }) => [pressed ? styles.pressableDown : null]}
        >
          <LinearGradient
            colors={canContinue ? ['#E8DB00', '#FFF433'] : ['#525252', '#3F3F46']}
            style={[styles.primaryButton, !canContinue ? styles.primaryButtonDisabled : null]}
          >
            <Text style={styles.primaryButtonText}>
              {draft.side === 'buy' ? 'Swap' : 'Sell'} {formatAmount(draft.amount, inputAsset?.symbol)} {inputAsset?.symbol ?? ''}{' '}
              {'->'} {outputAsset?.symbol ?? ''}
            </Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.footerCaption}>
          {isQuoteLoading ? 'Refreshing quote...' : `Quote refreshes in ${quoteCountdown}s`}
        </Text>
      </View>
    </View>
  )
}

function ConfirmScreen({
  isBusy,
  nowMs,
  onBack,
  onConfirm,
  quote,
}: {
  isBusy: boolean
  nowMs: number
  onBack: () => void
  onConfirm: () => void
  quote: SwapQuotePreview
}) {
  const quoteCountdown = Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - nowMs) / 1_000))

  return (
    <View style={styles.stageBody}>
      <View style={styles.confirmHero}>
        <View style={styles.confirmTokenBlock}>
          <Avatar badgeColor={quote.inputAsset.badgeColor} badgeText={quote.inputAsset.badgeText} />
          <Text style={styles.confirmHeroAmount}>{formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)}</Text>
          <Text style={styles.confirmHeroSymbol}>{quote.inputAsset.symbol}</Text>
        </View>
        <Ionicons color="#4ADE80" name="arrow-forward" size={28} />
        <View style={styles.confirmTokenBlock}>
          <Avatar badgeColor={quote.outputAsset.badgeColor} badgeText={quote.outputAsset.badgeText} />
          <Text style={styles.confirmHeroAmount}>{formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)}</Text>
          <Text style={styles.confirmHeroSymbol}>{quote.outputAsset.symbol}</Text>
        </View>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="You Send" value={`${formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} ${quote.inputAsset.symbol}`} />
        <SummaryRow
          label="You Receive"
          value={`${formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} ${quote.outputAsset.symbol}`}
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
        <SummaryRow label="Network Fee" value={`~${quote.networkFeeSol.toFixed(3)} SOL`} />
        <SummaryRow label="Jupiter Fee" value={formatCurrency(quote.platformFeeUsd)} />
        <SummaryRow label="Price Impact" value={`${quote.priceImpactPct.toFixed(2)}%`} valueTone="accent" />
      </View>

      <View style={styles.confirmActions}>
        <SecondaryButton icon="arrow-back" label="Back" onPress={onBack} />
        <SlideToConfirm
          disabled={false}
          isBusy={isBusy}
          label={isBusy ? 'Preparing swap...' : 'Slide to confirm swap'}
          onComplete={onConfirm}
        />
        <Text style={styles.footerCaption}>Quote expires in {quoteCountdown}s</Text>
      </View>
    </View>
  )
}

function ProgressItem({
  index,
  step,
  status,
}: {
  index: number
  status: 'active' | 'complete' | 'pending'
  step: SwapProgressStep
}) {
  const isComplete = status === 'complete'
  const isActive = status === 'active'

  return (
    <View style={[styles.progressRow, isActive ? styles.progressRowActive : null]}>
      <View
        style={[
          styles.progressBadge,
          isComplete ? styles.progressBadgeComplete : null,
          isActive ? styles.progressBadgeActive : null,
        ]}
      >
        {isComplete ? (
          <Ionicons color="#000000" name="checkmark" size={16} />
        ) : isActive ? (
          <ActivityIndicator color="#E8DB00" size="small" />
        ) : (
          <Text style={styles.progressBadgeText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.progressCopy}>
        <Text style={[styles.progressTitle, status === 'pending' ? styles.progressTitlePending : null]}>{step.title}</Text>
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
        <View style={styles.processingOuterRing}>
          <View style={styles.processingMiddleRing}>
            <View style={styles.processingInnerRing}>
              <ActivityIndicator color="#000000" size="small" />
            </View>
          </View>
        </View>
        <Text style={styles.processingTitle}>Swapping tokens</Text>
        {quote ? (
          <Text style={styles.processingSubtitle}>
            {formatAmount(quote.inputAsset.amount, quote.inputAsset.symbol)} {quote.inputAsset.symbol} {'->'}{' '}
            {formatAmount(quote.outputAsset.amount, quote.outputAsset.symbol)} {quote.outputAsset.symbol}
          </Text>
        ) : null}
      </View>

      <View style={styles.progressCard}>
        {steps.map((step, index) => {
          const status = index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'active' : 'pending'
          return <ProgressItem key={step.id} index={index} status={status} step={step} />
        })}
      </View>

      <View style={styles.processingNotice}>
        <Ionicons color="rgba(255,255,255,0.42)" name="information-circle-outline" size={18} />
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
  onViewActivity,
  quote,
  result,
}: {
  onBackToFeed: () => void
  onCopyShare: () => void
  onCopySignature: () => void
  onViewActivity: () => void
  quote: SwapQuotePreview
  result: Extract<SwapResult, { kind: 'success' }>
}) {
  return (
    <View style={styles.resultStageBody}>
      <View style={styles.resultHero}>
        <View style={styles.resultHeroIconSuccess}>
          <Ionicons color="#000000" name="checkmark" size={44} />
        </View>
        <Text style={styles.resultTitle}>Swap Complete!</Text>
        <Text style={styles.resultSubtitle}>Your {quote.outputAsset.symbol} tokens have been added to your wallet.</Text>
      </View>

      <View style={styles.metricsCard}>
        <SummaryRow label="Sent" value={`-${formatAmount(result.sentAmount, result.sentSymbol)} ${result.sentSymbol}`} />
        <SummaryRow
          label="Received"
          value={`+${formatAmount(result.receivedAmount, result.receivedSymbol)} ${result.receivedSymbol}`}
          valueTone="accent"
        />
        <SummaryRow label="Status" value={result.statusLabel} valueTone="accent" />
        <Pressable accessibilityRole="button" onPress={onCopySignature} style={({ pressed }) => [styles.summaryRow, pressed ? styles.pressableDown : null]}>
          <Text style={styles.summaryLabel}>TX Hash</Text>
          <View style={styles.txHashRow}>
            <Text style={styles.summaryValue}>{result.signature}</Text>
            <Ionicons color="rgba(255,255,255,0.66)" name="copy-outline" size={14} />
          </View>
        </Pressable>
      </View>

      <View style={styles.resultActions}>
        <SecondaryButton icon="share-social-outline" label="Share Trade" onPress={onCopyShare} />
        <PrimaryButton label="Back to Feed" onPress={onBackToFeed} />
        <Pressable accessibilityRole="button" onPress={onViewActivity} style={({ pressed }) => [pressed ? styles.pressableDown : null]}>
          <Text style={styles.textAction}>View in Activity</Text>
        </Pressable>
      </View>
    </View>
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
        <View style={styles.resultHeroIconFailure}>
          <Ionicons color="#000000" name="close" size={42} />
        </View>
        <Text style={styles.resultTitle}>Swap Failed</Text>
        <Text style={styles.resultSubtitle}>{result.message}</Text>
      </View>

      <View style={[styles.metricsCard, styles.failureCard]}>
        <SummaryRow label="Error" value={result.title} valueTone="danger" />
        <SummaryRow label="Attempted" value={quote ? `${quote.inputAsset.symbol} -> ${quote.outputAsset.symbol}` : result.attemptedPathLabel} />
        <SummaryRow label="Suggestion" value={result.suggestion} />
      </View>

      <View style={styles.resultActions}>
        <SecondaryButton icon="refresh" label="Try Again" onPress={onRetry} tone="danger" />
        <SecondaryButton icon="options-outline" label="Adjust Slippage & Retry" onPress={onAdjustSlippageAndRetry} />
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
  payload: SwapFlowPayload | null
}

export function SwapFlowModal({
  adapter = mockSwapQuoteAdapter,
  onClose,
  payload,
}: SwapFlowModalProps) {
  const router = useRouter()
  const flowIdRef = useRef(0)
  const requestIdRef = useRef(0)
  const [draft, setDraft] = useState<SwapDraft | null>(null)
  const [quote, setQuote] = useState<SwapQuotePreview | null>(null)
  const [stage, setStage] = useState<SwapStage>('entry')
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [executionResult, setExecutionResult] = useState<SwapResult | null>(null)
  const [executionSteps, setExecutionSteps] = useState<SwapProgressStep[]>([])
  const [activeProgressIndex, setActiveProgressIndex] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    if (!payload) {
      flowIdRef.current += 1
      requestIdRef.current += 1
      setDraft(null)
      setQuote(null)
      setExecutionResult(null)
      setExecutionSteps([])
      setActiveProgressIndex(0)
      setStage('entry')
      setIsQuoteLoading(false)
      setIsConfirming(false)
      return
    }

    flowIdRef.current += 1
    const nextDraft = createSwapDraft(payload)
    setDraft(nextDraft)
    setQuote(buildMockQuote(nextDraft))
    setExecutionResult(null)
    setExecutionSteps([])
    setActiveProgressIndex(0)
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
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setIsQuoteLoading(true)

      try {
        const nextQuote = await adapter.getQuote(nextDraft)
        if (requestIdRef.current !== requestId) {
          return null
        }

        setQuote(nextQuote)
        return nextQuote
      } finally {
        if (requestIdRef.current === requestId) {
          setIsQuoteLoading(false)
        }
      }
    },
    [adapter],
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

  useEffect(() => {
    if (stage !== 'processing' || executionSteps.length === 0) {
      return
    }

    setActiveProgressIndex(0)
    const timers = executionSteps.map((step, index) =>
      setTimeout(() => {
        setActiveProgressIndex(index + 1)
        triggerSelectionHaptic()
      }, executionSteps.slice(0, index + 1).reduce((total, current) => total + current.durationMs, 0)),
    )

    const totalDuration = executionSteps.reduce((total, current) => total + current.durationMs, 0)
    const finalizer = setTimeout(() => {
      if (!executionResult) {
        return
      }

      setStage(executionResult.kind === 'success' ? 'success' : 'failure')
    }, totalDuration + 120)

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      clearTimeout(finalizer)
    }
  }, [executionResult, executionSteps, stage])

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

  const handlePresetSelect = useCallback(
    (usdValue: number) => {
      updateDraft((current) => {
        const nextAmount = buildPresetAmountValue(current, usdValue)
        triggerSelectionHaptic()
        return {
          ...current,
          amount: nextAmount,
          amountText: String(nextAmount >= 1 ? Math.round(nextAmount) : Number(nextAmount.toFixed(4))),
        }
      })
    },
    [updateDraft],
  )

  const handleSlippageSelect = useCallback(
    (slippageBps: number) => {
      updateDraft((current) => ({
        ...current,
        slippageBps: clampSlippageBps(slippageBps),
      }))
      triggerSelectionHaptic()
    },
    [updateDraft],
  )

  const runExecution = useCallback(
    async (nextDraft: SwapDraft) => {
      const flowId = flowIdRef.current
      setIsConfirming(true)
      const nextQuote = await requestQuote(nextDraft)
      if (!nextQuote || flowIdRef.current !== flowId) {
        setIsConfirming(false)
        return
      }

      const executionDraft = {
        ...nextDraft,
        attemptCount: nextDraft.attemptCount + 1,
      }

      setDraft(executionDraft)
      setStage('processing')
      setExecutionSteps([])
      setExecutionResult(null)
      setActiveProgressIndex(0)

      const executionPlan = await adapter.getExecutionPlan({
        draft: executionDraft,
        quote: nextQuote,
      })

      if (flowIdRef.current !== flowId) {
        setIsConfirming(false)
        return
      }

      setExecutionSteps(executionPlan.steps)
      setExecutionResult(executionPlan.result)
      setIsConfirming(false)
    },
    [adapter, requestQuote],
  )

  const handleContinueToConfirm = useCallback(() => {
    if (!quote || !draft || draft.amount <= 0) {
      return
    }

    setStage('confirm')
    triggerImpactHaptic()
  }, [draft, quote])

  const handleConfirm = useCallback(() => {
    if (!draft) {
      return
    }

    void runExecution(draft)
  }, [draft, runExecution])

  const handleRetry = useCallback(() => {
    if (!draft) {
      return
    }

    void runExecution(draft)
  }, [draft, runExecution])

  const handleAdjustSlippageAndRetry = useCallback(() => {
    if (!draft) {
      return
    }

    const nextDraft = {
      ...draft,
      slippageBps: Math.max(draft.slippageBps, 100),
    }
    setDraft(nextDraft)
    void runExecution(nextDraft)
  }, [draft, runExecution])

  const handleBackToEntry = useCallback(() => {
    setStage('entry')
    triggerSelectionHaptic()
  }, [])

  const handleBackToFeed = useCallback(() => {
    onClose()
  }, [onClose])

  const handleViewActivity = useCallback(() => {
    onClose()
    router.push('/(tabs)/activity')
  }, [onClose, router])

  const handleCopyShare = useCallback(() => {
    if (executionResult?.kind !== 'success') {
      return
    }

    Clipboard.setString(executionResult.shareText)
    triggerImpactHaptic()
  }, [executionResult])

  const handleCopySignature = useCallback(() => {
    if (executionResult?.kind !== 'success') {
      return
    }

    Clipboard.setString(executionResult.signature)
    triggerSelectionHaptic()
  }, [executionResult])

  if (!payload || !draft) {
    return null
  }

  const stageTitle = getStageTitle(stage, draft)
  const shouldShowClose = stage === 'entry' || stage === 'confirm' || stage === 'success' || stage === 'failure'

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
          <Pressable
            accessibilityLabel={stage === 'confirm' ? 'Back to swap entry' : 'Close swap flow'}
            accessibilityRole="button"
            disabled={stage === 'processing'}
            onPress={stage === 'confirm' ? handleBackToEntry : onClose}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.pressableDown : null]}
          >
            <Ionicons color="#FFFFFF" name="chevron-back" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>{stageTitle}</Text>
          <View style={styles.providerBadge}>
            <View style={styles.providerDot} />
            <Text style={styles.providerBadgeText}>{quote?.providerLabel ?? 'Jupiter'}</Text>
          </View>
        </View>

        {stage === 'entry' ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <EntryScreen
              draft={draft}
              isQuoteLoading={isQuoteLoading}
              nowMs={nowMs}
              onAmountTextChange={handleAmountTextChange}
              onContinue={handleContinueToConfirm}
              onCycleCounterAsset={handleCycleCounterAsset}
              onPresetSelect={handlePresetSelect}
              onSlippageSelect={handleSlippageSelect}
              quote={quote}
            />
          </ScrollView>
        ) : null}

        {stage === 'confirm' && quote ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <ConfirmScreen
              isBusy={isConfirming}
              nowMs={nowMs}
              onBack={handleBackToEntry}
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
            onViewActivity={handleViewActivity}
            quote={quote}
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
  swapPayload: SwapFlowPayload | null
}

export function FeedInteractionOverlays({
  actionPayload,
  onCloseActionSheet,
  onCloseSwapFlow,
  swapPayload,
}: FeedInteractionOverlaysProps) {
  return (
    <>
      <FeedPlaceholderSheet onClose={onCloseActionSheet} payload={actionPayload} />
      <SwapFlowModal onClose={onCloseSwapFlow} payload={swapPayload} />
    </>
  )
}

const styles = StyleSheet.create({
  amountInput: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: interFontFamily.black,
    fontSize: 52,
    lineHeight: 58,
    padding: 0,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  amountSubtext: {
    color: 'rgba(255,255,255,0.48)',
    fontFamily: interFontFamily.medium,
    fontSize: 15,
    marginTop: 6,
  },
  assetPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: 1,
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
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 12,
  },
  assetPillLabel: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 18,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#000000',
    fontFamily: interFontFamily.bold,
    fontSize: 18,
  },
  avatarImage: {
    backgroundColor: '#111111',
    borderRadius: 999,
  },
  cardBalance: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: interFontFamily.medium,
    fontSize: 15,
  },
  cardEyebrow: {
    color: '#D4C532',
    fontFamily: interFontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 225, 0, 0.10)',
    borderColor: 'rgba(255, 225, 0, 0.24)',
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderColor: 'rgba(239, 68, 68, 0.26)',
  },
  chipSelected: {
    backgroundColor: 'rgba(255, 225, 0, 0.22)',
    borderColor: '#FACC15',
  },
  chipText: {
    color: '#F7E957',
    fontFamily: interFontFamily.bold,
    fontSize: 15,
  },
  chipTextSelected: {
    color: '#FFFDEE',
  },
  confirmActions: {
    alignItems: 'center',
    gap: 18,
    marginTop: 'auto',
  },
  confirmHero: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 36,
  },
  confirmHeroAmount: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.black,
    fontSize: 24,
    marginTop: 12,
  },
  confirmHeroSymbol: {
    color: 'rgba(255,255,255,0.48)',
    fontFamily: interFontFamily.medium,
    fontSize: 18,
    marginTop: 4,
  },
  confirmTokenBlock: {
    alignItems: 'center',
    minWidth: 120,
  },
  entryFooter: {
    gap: 10,
    marginTop: 4,
  },
  failureCard: {
    backgroundColor: 'rgba(75, 5, 10, 0.44)',
    borderColor: 'rgba(239, 68, 68, 0.18)',
  },
  footerCaption: {
    color: 'rgba(255,255,255,0.36)',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: interFontFamily.bold,
    fontSize: 26,
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  labelBadge: {
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
    borderColor: 'rgba(250, 204, 21, 0.22)',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelBadgeText: {
    color: '#E8DB00',
    fontFamily: interFontFamily.medium,
    fontSize: 13,
  },
  metricsCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalRoot: {
    backgroundColor: semanticColors.app.background,
    flex: 1,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  pressableDown: {
    opacity: 0.85,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#09090B',
    fontFamily: interFontFamily.black,
    fontSize: 18,
    textAlign: 'center',
  },
  processingCopy: {
    gap: 8,
  },
  processingHeroWrap: {
    alignItems: 'center',
    marginBottom: 26,
    marginTop: 22,
  },
  processingInnerRing: {
    alignItems: 'center',
    backgroundColor: '#FACC15',
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  processingMiddleRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    borderRadius: 999,
    height: 108,
    justifyContent: 'center',
    width: 108,
  },
  processingNotice: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 'auto',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  processingNoticeText: {
    color: 'rgba(255,255,255,0.48)',
    flex: 1,
    fontFamily: interFontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  processingOuterRing: {
    alignItems: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    borderRadius: 999,
    height: 138,
    justifyContent: 'center',
    width: 138,
  },
  processingRoot: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  processingSubtitle: {
    color: 'rgba(255,255,255,0.44)',
    fontFamily: interFontFamily.medium,
    fontSize: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  processingTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.black,
    fontSize: 38,
    lineHeight: 42,
    marginTop: 22,
    textAlign: 'center',
  },
  progressBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  progressBadgeActive: {
    borderColor: 'rgba(250, 204, 21, 0.52)',
    borderWidth: 1,
  },
  progressBadgeComplete: {
    backgroundColor: '#FACC15',
  },
  progressBadgeText: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: interFontFamily.bold,
    fontSize: 14,
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 2,
    padding: 10,
  },
  progressCopy: {
    flex: 1,
    gap: 4,
  },
  progressDescription: {
    color: 'rgba(255,255,255,0.46)',
    fontFamily: interFontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
  },
  progressDescriptionPending: {
    color: 'rgba(255,255,255,0.22)',
  },
  progressRow: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  progressRowActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  progressTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 17,
  },
  progressTitlePending: {
    color: 'rgba(255,255,255,0.32)',
  },
  providerBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  providerBadgeText: {
    color: '#D4D4D8',
    fontFamily: interFontFamily.medium,
    fontSize: 14,
  },
  providerDot: {
    backgroundColor: '#E8DB00',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  quoteCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  quoteCardReceive: {
    backgroundColor: 'rgba(255, 225, 0, 0.05)',
  },
  receiveAmount: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.black,
    fontSize: 46,
    lineHeight: 52,
  },
  resultActions: {
    gap: 14,
    marginTop: 'auto',
  },
  resultHero: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 22,
  },
  resultHeroIconFailure: {
    alignItems: 'center',
    backgroundColor: '#FF4747',
    borderRadius: 999,
    height: 124,
    justifyContent: 'center',
    marginBottom: 24,
    width: 124,
  },
  resultHeroIconSuccess: {
    alignItems: 'center',
    backgroundColor: '#E8DB00',
    borderRadius: 999,
    height: 124,
    justifyContent: 'center',
    marginBottom: 24,
    width: 124,
  },
  resultStageBody: {
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  resultSubtitle: {
    color: 'rgba(255,255,255,0.42)',
    fontFamily: interFontFamily.medium,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  resultTitle: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.black,
    fontSize: 44,
    lineHeight: 48,
    marginBottom: 10,
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  secondaryButtonDanger: {
    backgroundColor: '#FF4545',
    borderColor: 'rgba(255, 69, 69, 0.6)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 17,
  },
  sliderThumb: {
    alignItems: 'center',
    backgroundColor: '#FACC15',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    left: 6,
    position: 'absolute',
    top: 6,
    width: 52,
  },
  sliderTrack: {
    backgroundColor: 'rgba(255, 225, 0, 0.08)',
    borderColor: 'rgba(255, 225, 0, 0.18)',
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
    color: 'rgba(255,255,255,0.54)',
    fontFamily: interFontFamily.bold,
    fontSize: 22,
    paddingLeft: 88,
    textAlign: 'center',
  },
  sliderTrackLabelBusy: {
    paddingLeft: 72,
  },
  slippageChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stageBody: {
    flex: 1,
    gap: 16,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.36)',
    fontFamily: interFontFamily.medium,
    fontSize: 17,
  },
  summaryRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.bold,
    fontSize: 17,
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryValueAccent: {
    color: '#F7E957',
  },
  summaryValueDanger: {
    color: semanticColors.text.danger,
  },
  summaryValueMuted: {
    color: 'rgba(255,255,255,0.48)',
  },
  swapDirectionBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  textAction: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: interFontFamily.medium,
    fontSize: 17,
    textAlign: 'center',
  },
  tokenSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  tokenSummaryCopy: {
    flex: 1,
  },
  tokenSummaryHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  tokenSummaryMeta: {
    color: 'rgba(255,255,255,0.48)',
    fontFamily: interFontFamily.medium,
    fontSize: 17,
    marginTop: 4,
  },
  tokenSummarySymbol: {
    color: '#FFFFFF',
    fontFamily: interFontFamily.black,
    fontSize: 34,
    lineHeight: 38,
  },
  txHashRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
})
