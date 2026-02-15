import * as React from 'react';
import { Tabs } from 'expo-router';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { BlurView } from 'expo-blur';

import { theme } from '@/constants/theme';

function TabIcon({ name, color }: { name: React.ComponentProps<typeof FontAwesome6>['name']; color: string }) {
  return <FontAwesome6 size={18} name={name} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted2,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.10)',
          backgroundColor: 'transparent',
        },
        tabBarBackground: () => <BlurView intensity={28} tint="dark" style={{ flex: 1 }} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Analitica',
          tabBarIcon: ({ color }) => <TabIcon name="chart-line" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ongoing"
        options={{
          title: 'Em andamento',
          tabBarIcon: ({ color }) => <TabIcon name="bolt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historico',
          tabBarIcon: ({ color }) => <TabIcon name="clock-rotate-left" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
