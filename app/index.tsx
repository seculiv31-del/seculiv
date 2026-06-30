import { Redirect } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

/**
 * Porte d'entrée de l'app : tant que la session/le profil sont en cours de
 * chargement, on affiche ce splash. Une fois `loading` à false, on redirige
 * (sans laisser ce splash dans l'historique) vers :
 *  - /(auth)/login si aucune session,
 *  - /(client), /(driver) ou /(admin) selon `profiles.role`.
 *
 * Rappel sécurité : cet aiguillage ne sert qu'à l'expérience utilisateur.
 * La protection réelle des données reste assurée par les policies RLS
 * Supabase, pas par cette redirection côté client.
 */
export default function SplashRouter() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <SplashView />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  switch (profile?.role) {
    case 'driver':
      return <Redirect href="/(driver)/(tabs)" />;
    case 'admin':
      return <Redirect href="/(admin)/(tabs)" />;
    case 'client':
    default:
      return <Redirect href="/(client)/(tabs)" />;
  }
}

function SplashView() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          source={require('../assets/images/logo-blanc-v2.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.statusText}>Vérification de la session…</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  statusText: {
    fontSize: 13,
    color: '#9FB0CC',
  },
  logo: {
    width: 280,
    height: 320,
  },
});
