import { Tabs } from 'expo-router';
import { History, Package, User } from 'lucide-react-native';

import { colors } from '@/src/theme/colors';

export default function DriverTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activité',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
