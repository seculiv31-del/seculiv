import { Tabs } from 'expo-router';
import { MapPin, Send, User } from 'lucide-react-native';

import { colors } from '@/src/theme/colors';

export default function ClientTabsLayout() {
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
          title: 'Envoyer',
          tabBarIcon: ({ color, size }) => <Send color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Suivre',
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
