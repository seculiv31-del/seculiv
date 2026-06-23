import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/src/lib/AuthContext';
import { registerNotificationListeners, setupNotificationHandler } from '@/src/lib/notifications';

function AppShell() {
  const router = useRouter();

  useEffect(() => {
    setupNotificationHandler();
    const cleanup = registerNotificationListeners((path) =>
      router.push(path as Parameters<typeof router.push>[0])
    );
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </AuthProvider>
  );
}
