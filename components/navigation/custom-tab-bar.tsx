import { homeDesignSpec } from '@/features/feed/home-design-spec'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
              style={[styles.item, { opacity: isFocused ? homeDesignSpec.tabBar.activeOpacity : homeDesignSpec.tabBar.inactiveOpacity }]}
            >
              {isFocused ? (
                <>
                  <LinearGradient
                    colors={[homeDesignSpec.tabBar.activeGradientTop, homeDesignSpec.tabBar.activeGradientBottom]}
                    style={styles.activeGradient}
                    pointerEvents="none"
                  />
                  <View style={styles.activeTopBorder} pointerEvents="none" />
                </>
              ) : null}
              <Ionicons
                name={getTabIconName(route.name, isFocused)}
                size={24}
                color="#FFFFFF"
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
    borderTopColor: homeDesignSpec.tabBar.activeBorder,
    borderTopWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    backgroundColor: homeDesignSpec.tabBar.background,
    borderTopColor: homeDesignSpec.tabBar.border,
    borderTopWidth: 1,
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  row: {
    alignItems: 'stretch',
    flexDirection: 'row',
    height: homeDesignSpec.tabBar.contentHeight,
    justifyContent: 'space-between',
    width: '100%',
  },
})
