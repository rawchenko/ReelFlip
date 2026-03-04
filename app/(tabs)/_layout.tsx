import { CustomTabBar } from '@/components/navigation/custom-tab-bar'
import { Redirect, Tabs } from 'expo-router'
import { semanticColors } from '@/constants/semantic-colors'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'
import { homeDesignSpec } from '@/features/feed/home-design-spec'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TabsLayout() {
  const { hasCompletedOnboarding, hasHydrated } = useOnboarding()
  const insets = useSafeAreaInsets()
  const tabBarBottomPadding = insets.bottom > 0 ? Math.max(insets.bottom - 8, 12) : 20
  const tabBarReservedHeight = homeDesignSpec.tabBar.contentHeight + tabBarBottomPadding

  if (!hasHydrated) {
    return null
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="../onboarding" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: semanticColors.app.background,
          paddingBottom: tabBarReservedHeight,
        },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  )
}
