import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter'
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Text } from 'react-native'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { semanticColors } from '@/constants/semantic-colors'
import { interFontFamily } from '@/constants/typography'

type TextWithDefaultProps = {
  defaultProps?: {
    style?: unknown
  }
}

const TextComponent = Text as unknown as TextWithDefaultProps
let hasAppliedDefaultTextFont = false

void SplashScreen.preventAutoHideAsync()

function applyDefaultTextFont(): void {
  if (hasAppliedDefaultTextFont) {
    return
  }

  hasAppliedDefaultTextFont = true

  const existingStyle = TextComponent.defaultProps?.style
  TextComponent.defaultProps = {
    ...TextComponent.defaultProps,
    style: existingStyle
      ? [{ fontFamily: interFontFamily.regular }, existingStyle]
      : { fontFamily: interFontFamily.regular },
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  })

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      return
    }

    if (fontsLoaded) {
      applyDefaultTextFont()
    }

    void SplashScreen.hideAsync()
  }, [fontError, fontsLoaded])

  if (!fontsLoaded && !fontError) {
    return null
  }

  return (
    <AppProviders>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-2" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-3" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-4" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-5" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tx-details" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="settings-slippage" options={{ headerShown: false }} />
        <Stack.Screen name="settings-currency" options={{ headerShown: false }} />
        <Stack.Screen name="settings-network" options={{ headerShown: false }} />
        <Stack.Screen name="settings-wallet" options={{ headerShown: false }} />
        <Stack.Screen name="debug" options={{ title: 'Debug' }} />
      </Stack>
      <StatusBar style="light" backgroundColor={semanticColors.app.background} translucent={false} />
    </AppProviders>
  )
}
