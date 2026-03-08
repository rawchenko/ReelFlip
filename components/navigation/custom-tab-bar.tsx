import { semanticColors } from '@/constants/semantic-colors'
import { homeDesignSpec } from '@/features/feed/home-design-spec'
import { interFontFamily } from '@/constants/typography'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function getTabIconName(routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap {
  if (routeName === 'feed') {
    return focused ? 'home' : 'home-outline'
  }

  if (routeName === 'activity') {
    return focused ? 'time' : 'time-outline'
  }

  return focused ? 'person-circle' : 'person-circle-outline'
}

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottomPadding = insets.bottom > 0 ? Math.max(insets.bottom - 8, 12) : 20
  const androidBlurMethod = Platform.OS === 'android' ? 'dimezisBlurView' : undefined

  return (
    <View
      style={[
        styles.container,
        {
          minHeight: homeDesignSpec.tabBar.contentHeight + bottomPadding,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      <View style={styles.backdropLayer} pointerEvents="none">
        <BlurView
          tint="dark"
          intensity={42}
          experimentalBlurMethod={androidBlurMethod}
          style={styles.backdropBlur}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[semanticColors.tabBar.backdropGradientTop, semanticColors.tabBar.backdropGradientBottom]}
          style={styles.backdropGradient}
          pointerEvents="none"
        />
      </View>
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const isFocused = state.index === index
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params)
            }
          }

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.item, { opacity: isFocused ? 1 : 0.5 }]}
            >
              {isFocused ? (
                <>
                  <LinearGradient
                    colors={[semanticColors.tabBar.activeGradientTop, semanticColors.tabBar.activeGradientBottom]}
                    style={styles.activeGradient}
                    pointerEvents="none"
                  />
                  <View style={styles.activeTopBorder} pointerEvents="none" />
                </>
              ) : null}
              <Ionicons
                name={getTabIconName(route.name, isFocused)}
                size={24}
                color={semanticColors.icon.primary}
              />
              <Text style={styles.label}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  activeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  activeTopBorder: {
    borderTopColor: semanticColors.tabBar.activeIndicator,
    borderTopWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backdropGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: semanticColors.tabBar.backdropLayer,
  },
  container: {
    backgroundColor: 'transparent',
    bottom: 0,
    borderTopColor: semanticColors.tabBar.border,
    borderTopWidth: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    height: homeDesignSpec.tabBar.contentHeight,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  label: {
    color: semanticColors.text.headingOnDark,
    fontFamily: interFontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  row: {
    alignItems: 'stretch',
    flexDirection: 'row',
    height: homeDesignSpec.tabBar.contentHeight,
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%',
  },
})
