// app/(tabs)/_layout.tsx
// Custom Tab Bar: 🔥 Streak | 🌍 Dashboard-Sheet | ⚙️ Settings

import { Tabs, router } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserCtx } from '../../lib/userContext';
import { COLORS } from '../../lib/constants';

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { streak, openDashboard } = useUserCtx();

  const routes = state.routes;
  const currentIndex = state.index;

  const tabs = [
    {
      key: 'streak',
      icon: '🔥',
      label: streak > 0 ? String(streak) : '',
      onPress: () => {
        const indexRoute = routes.find((r: any) => r.name === 'index');
        if (indexRoute) navigation.navigate(indexRoute.name);
      },
    },
    {
      key: 'globe',
      icon: '🌍',
      label: '',
      onPress: openDashboard,
    },
    {
      key: 'settings',
      icon: '⚙️',
      label: '',
      onPress: () => {
        const settingsRoute = routes.find((r: any) => r.name === 'settings');
        if (settingsRoute) navigation.navigate(settingsRoute.name);
      },
    },
  ];

  const activeTabName = routes[currentIndex]?.name;

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || 8 }]}>
      {tabs.map((tab) => {
        const isActive =
          (tab.key === 'streak' && activeTabName === 'index') ||
          (tab.key === 'settings' && activeTabName === 'settings');

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={tab.onPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, tab.key === 'globe' && styles.globeIcon]}>
              {tab.icon}
            </Text>
            {tab.label ? (
              <Text style={styles.streakLabel}>{tab.label}</Text>
            ) : null}
            {/* Aktiver Tab: Punkt-Indikator */}
            {isActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 82 : 64,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIcon: {
    fontSize: 26,
  },
  globeIcon: {
    fontSize: 30,
  },
  streakLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.black,
    marginTop: 2,
  },
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.black,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
