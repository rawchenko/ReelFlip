import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { semanticColors } from '@/constants/semantic-colors'
import { useOnboarding } from '@/features/onboarding/onboarding-provider'

export default function IndexScreen() {
  const { hasCompletedOnboarding, hasHydrated } = useOnboarding()

  if (!hasHydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={semanticColors.text.primary} />
      </View>
    )
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="./onboarding" />
  }

  return <Redirect href="/(tabs)/feed" />
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: semanticColors.app.background,
    flex: 1,
    justifyContent: 'center',
  },
})
