import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import type { UserRole } from '@/src/types';

const ROLE_HOME = {
  client: '/(client)/(tabs)',
  driver: '/(driver)/(tabs)',
  admin: '/(admin)/(tabs)',
} as const;

type RoleGateProps = {
  allowedRole: UserRole;
};

/**
 * Garde-fou posé dans le _layout.tsx de chaque groupe (client/driver/admin).
 *
 * IMPORTANT — ceci est une protection d'EXPÉRIENCE UTILISATEUR uniquement :
 * elle évite d'afficher le mauvais écran dans l'app. Elle n'empêche pas un
 * appel API direct. La vraie sécurité des données vient des policies RLS
 * définies côté Supabase sur chaque table.
 */
export function RoleGate({ allowedRole }: RoleGateProps) {
  const { session, profile, driverError, loading, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profile?.role !== allowedRole) {
    return <Redirect href={ROLE_HOME[profile?.role ?? 'client']} />;
  }

  // Profil "driver" sans fiche `drivers` correspondante : incohérence de
  // données, on évite d'afficher des écrans livreur vides/cassés.
  if (allowedRole === 'driver' && driverError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>
          Ton compte livreur est introuvable. Contacte le support SECULIV.
        </Text>
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});
