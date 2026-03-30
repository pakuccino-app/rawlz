// app/(tabs)/_layout.tsx
// Dark-Mode Tab-Bar – konzeptkonform, ohne externe Icon-Library

import { Tabs } from 'expo-router';
import { Text, Platform } from 'react-native';

const TAB_BG      = '#0A0A0A';
const TAB_ACTIVE  = '#FFFFFF';
const TAB_INACTIVE = '#4B5563';
const TAB_BORDER  = '#1F2937';

function Icon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopColor: TAB_BORDER,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 6,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => <Icon symbol="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color }) => <Icon symbol="○" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => <Icon symbol="◉" color={color} />,
        }}
      />
    </Tabs>
  );
}
