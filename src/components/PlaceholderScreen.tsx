import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

type PlaceholderScreenProps = {
  title: string;
};

export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {profile?.full_name ?? 'Utilisateur'} · rôle : {profile?.role ?? 'inconnu'}
          </Text>
        </View>

        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.muted,
  },
});
