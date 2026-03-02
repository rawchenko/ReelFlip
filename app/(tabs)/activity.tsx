import React from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'
import { appStyles } from '@/constants/app-styles'

export default function ActivityScreen() {
    return (
        <SafeAreaView edges={['top']} style={appStyles.tabScreen}>
            <View style={appStyles.tabPlaceholder}>
                <Text style={appStyles.tabPlaceholderTitle}>Activity</Text>
                <Text style={appStyles.tabPlaceholderText}>Your trading activity and transaction history will appear here.</Text>
            </View>
        </SafeAreaView>
    )
}
