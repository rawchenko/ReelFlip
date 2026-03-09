import { profileDesignSpec } from '@/features/profile/profile-design-spec'
import { ProfileAllocationBar } from '@/features/profile/profile-allocation-bar'
import { ProfileAssetCard } from '@/features/profile/profile-asset-card'
import { ProfileBalanceBar } from '@/features/profile/profile-balance-bar'
import { ProfileHeader } from '@/features/profile/profile-header'
import { ProfileTabStrip } from '@/features/profile/profile-tab-strip'
import { ProfileWatchlistCard } from '@/features/profile/profile-watchlist-card'
import type { AllocationSegment, PortfolioAsset, ProfileTab, WatchlistItem } from '@/features/profile/types'
import React, { useCallback, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'

const spec = profileDesignSpec

type ListItem = PortfolioAsset | WatchlistItem

function isPortfolioAsset(item: ListItem): item is PortfolioAsset {
  return 'usdValue' in item
}

export function ProfileScreenContent({
  address,
  totalBalance,
  changePercent,
  allocation,
  assets,
  watchlist,
  onUnfollow,
}: {
  address: string
  totalBalance: number
  changePercent: number
  allocation: AllocationSegment[]
  assets: PortfolioAsset[]
  watchlist: WatchlistItem[]
  onUnfollow: (mint: string) => void
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('assets')

  const data: ListItem[] = activeTab === 'watchlist' ? watchlist : assets

  const renderHeader = useCallback(
    () => (
      <>
        <ProfileHeader address={address} />
        <ProfileBalanceBar totalBalance={totalBalance} changePercent={changePercent} />
        <ProfileAllocationBar segments={allocation} />
        <ProfileTabStrip activeTab={activeTab} onTabChange={setActiveTab} />
      </>
    ),
    [activeTab, address, allocation, changePercent, totalBalance],
  )

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => (
      <View style={styles.cardWrapper}>
        {isPortfolioAsset(item) ? (
          <ProfileAssetCard asset={item} />
        ) : (
          <ProfileWatchlistCard item={item} onUnfollow={onUnfollow} />
        )}
      </View>
    ),
    [onUnfollow],
  )

  return (
    <FlatList
      data={data}
      // Reset scroll position when switching tabs
      key={activeTab}
      keyExtractor={(item) => item.mint}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={styles.listContent}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  cardWrapper: {
    paddingHorizontal: spec.card.listHorizontalPadding,
    paddingTop: spec.card.listGap,
  },
  listContent: {
    paddingBottom: spec.card.listBottomPadding,
    paddingTop: spec.card.listTopPadding - spec.card.listGap,
  },
})
