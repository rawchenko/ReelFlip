import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { Text, View } from 'react-native'
import { appStyles } from '@/constants/app-styles'

export default function ProfileScreen() {
  return (
    <SafeAreaView edges={['top']} style={appStyles.tabScreen}>
      <View style={appStyles.tabPlaceholder}>
        <Text style={appStyles.tabPlaceholderTitle}>Profile</Text>
        <Text style={appStyles.tabPlaceholderText}>Account and settings controls will be expanded here.</Text>
        <Link href="/debug" style={appStyles.profileDebugLink}>
          Open Debug Screen
        </Link>
      </View>
    </SafeAreaView>
  )
}
