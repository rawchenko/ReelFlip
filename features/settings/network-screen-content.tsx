import { settingsDesignSpec } from '@/features/settings/settings-design-spec'
import { SettingsHeader } from '@/features/settings/settings-header'
import { SettingsRadioRow } from '@/features/settings/settings-radio-row'
import { useNetwork } from '@/features/network/use-network'
import { interFontFamily } from '@/constants/typography'
import { SolanaCluster } from '@wallet-ui/react-native-kit'
import React, { useCallback } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

const spec = settingsDesignSpec

function GreenDot() {
  return <View style={styles.greenDot} />
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function NetworkScreenContent() {
  const { networks, selectedNetwork, setSelectedNetwork } = useNetwork()

  const handleSelect = useCallback(
    (network: SolanaCluster) => {
      setSelectedNetwork(network)
    },
    [setSelectedNetwork],
  )

  return (
    <ScrollView style={styles.scroll}>
      <SettingsHeader title="Solana Network" />
      <Text style={styles.description}>
        Choose which Solana cluster to connect to. Use Mainnet for real transactions.
      </Text>
      {networks.map((network) => {
        const isSelected = network.id === selectedNetwork.id
        return (
          <SettingsRadioRow
            key={network.id}
            selected={isSelected}
            onSelect={() => handleSelect(network)}
            label={network.label}
            subtitle={extractHost(network.url)}
            leftContent={isSelected ? <GreenDot /> : null}
          />
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  description: {
    color: spec.colors.rowSubtitle,
    fontFamily: interFontFamily.regular,
    fontSize: spec.subScreen.descriptionFontSize,
    lineHeight: spec.subScreen.descriptionLineHeight,
    paddingHorizontal: spec.subScreen.descriptionPaddingHorizontal,
    paddingVertical: spec.subScreen.descriptionPaddingVertical,
  },
  greenDot: {
    backgroundColor: spec.colors.greenDot,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  scroll: {
    flex: 1,
  },
})
