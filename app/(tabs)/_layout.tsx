import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { semanticColors } from '@/constants/semantic-colors'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: semanticColors.app.background },
        tabBarStyle: {
          backgroundColor: semanticColors.app.background,
          borderTopColor: semanticColors.border.default,
        },
        tabBarActiveTintColor: semanticColors.text.primary,
        tabBarInactiveTintColor: semanticColors.text.muted,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Ionicons name="play-circle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
