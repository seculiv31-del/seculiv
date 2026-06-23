import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CreditCard,
  FileText,
  ShieldCheck,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LucideProps } from 'lucide-react-native';
import { router } from 'expo-router';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { SectionTitle } from '@/src/components/SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type AccountRow = {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
  onPress?: () => void;
};

const ACCOUNT_ROWS: AccountRow[] = [
  { key: 'certificates',  label: 'Mes certificats de livraison', icon: FileText,      onPress: () => router.push('/certificates') },
  { key: 'notifications', label: 'Notifications',                icon: Bell,          onPress: () => router.push('/notifications-settings') },
  { key: 'payments',      label: 'Moyens de paiement',           icon: CreditCard }, // TODO
  { key: 'security',      label: 'Sécurité du compte',           icon: ShieldCheck }, // TODO
  { key: 'incident',      label: 'Signaler un incident',         icon: AlertTriangle }, // TODO Étape 6
];

function getInitials(fullName: string | null): string {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ClientAccountScreen() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Compte" />

        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile?.full_name ?? null)}</Text>
          </View>
          <View style={styles.profileTexts}>
            <Text style={styles.profileName}>{profile?.full_name || 'Utilisateur SECULIV'}</Text>
            <Text style={styles.profileSubtitle}>{profile?.phone || '—'} · Client</Text>
          </View>
        </Card>

        <Card style={styles.rowsCard}>
          {ACCOUNT_ROWS.map((row, index) => (
            <AccountRowItem key={row.key} row={row} isLast={index === ACCOUNT_ROWS.length - 1} />
          ))}
        </Card>

        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountRowItem({ row, isLast }: { row: AccountRow; isLast: boolean }) {
  const Icon = row.icon;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, !isLast && styles.rowBorder, pressed && row.onPress && styles.rowPressed]}
      onPress={row.onPress}
      disabled={!row.onPress}
    >
      <View style={styles.rowIcon}>
        <Icon size={18} color={colors.navy} />
      </View>
      <Text style={styles.rowLabel}>{row.label}</Text>
      <ChevronRight size={18} color={row.onPress ? colors.muted : colors.line} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.green,
  },
  profileTexts: {
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  profileSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  rowsCard: {
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  rowPressed: { opacity: 0.7 },
});
