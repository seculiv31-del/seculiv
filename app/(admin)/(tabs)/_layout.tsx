import { Tabs } from 'expo-router';
import { Bike, LayoutDashboard, Package, Shield, ShieldAlert } from 'lucide-react-native';

import { colors } from '@/src/theme/colors';

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Livraisons',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Livreurs',
          tabBarIcon: ({ color, size }) => <Bike color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Monitoring',
          tabBarIcon: ({ color, size }) => <Shield color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ color, size }) => <ShieldAlert color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
