import { CustomTabBar } from '@/components/navigation/custom-tab-bar'
import { Redirect, Tabs } from 'expo-router'
import { semanticColors } from '@/constants/semantic-colors'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

export default function TabsLayout() {
  const { hasCompletedOnboarding, hasHydrated } = useOnboarding()

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
        sceneStyle: { backgroundColor: semanticColors.app.background },
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
