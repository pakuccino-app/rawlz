// app/(tabs)/_layout.tsx
// Tab-Navigation – Tab-Bar auf Swipe-Screen verbergen (hat eigene Bottom-Bar)

import { Tabs, useSegments } from 'expo-router';
import { Text, Platform } from 'react-native';

const TAB_BG       = '#FFFFFF';
const TAB_ACTIVE   = '#111111';
const TAB_INACTIVE = '#9CA3AF';
const TAB_BORDER   = '#F3F4F6';

function Icon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

export default function TabsLayout() {
  const segments = useSegments();
  // Swipe-Screen hat eigene Bottom-Bar → Tab-Bar verbergen
  const isSwipeScreen = segments[segments.length - 1] === '(tabs)' || !segments.includes('search') && !segments.includes('settings');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isSwipeScreen
          ? { display: 'none' }
          : {
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
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color }) => <Icon symbol="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color }) => <Icon symbol="⊙" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => <Icon symbol="◎" color={color} />,
        }}
      />
    </Tabs>
  );
}
