// app/(tabs)/_layout.tsx
// Tab-Bar nur auf Search/Settings sichtbar. Swipe-Screen hat eigene Bottom-Bar.

import { Tabs } from 'expo-router';
import { Text, Platform } from 'react-native';

const TAB_BG       = '#FFFFFF';
const TAB_ACTIVE   = '#111111';
const TAB_INACTIVE = '#9CA3AF';
const TAB_BORDER   = '#F3F4F6';

function Icon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* Swipe-Screen: Tab-Bar komplett verstecken – eigene Bottom-Bar */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color }) => <Icon symbol="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarStyle: {
            backgroundColor: TAB_BG,
            borderTopColor: TAB_BORDER,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 60,
            paddingBottom: Platform.OS === 'ios' ? 28 : 6,
            paddingTop: 8,
          },
          tabBarIcon: ({ color }) => <Icon symbol="⊙" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarStyle: {
            backgroundColor: TAB_BG,
            borderTopColor: TAB_BORDER,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 60,
            paddingBottom: Platform.OS === 'ios' ? 28 : 6,
            paddingTop: 8,
          },
          tabBarIcon: ({ color }) => <Icon symbol="◎" color={color} />,
        }}
      />
    </Tabs>
  );
}
