import { router } from 'expo-router';
import { Bell, Bike, ChevronRight, Clock, ShieldCheck, ShieldX, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { DRIVER_STATUS_INFO } from '@/src/lib/driverActions';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { DriverStatus } from '@/src/types';

function useDriverAvgRating(driverId: string | undefined): number | null {
  const [avg, setAvg] = useState<number | null>(null);

  useEffect(() => {
    if (!driverId) return;
    (async () => {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('driver_id', driverId)
        .eq('status', 'livree');

      const ids = (orders ?? []).map((o) => o.id as string);
      if (ids.length === 0) return;

      const { data: ratings } = await supabase
        .from('delivery_ratings')
        .select('score')
        .in('order_id', ids);

      const scores = (ratings ?? []).map((r) => r.score as number);
      if (scores.length === 0) return;
      setAvg(scores.reduce((a, b) => a + b, 0) / scores.length);
    })();
  }, [driverId]);

  return avg;
}

function getInitials(fullName: string | null): string {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function DriverAccountScreen() {
  const { profile, driver, refreshDriver, signOut } = useAuth();
  const [toggling, setToggling] = useState(false);
  const avgRating = useDriverAvgRating(driver?.id);

  const isOnline = driver?.status === 'disponible';
  const canToggle = driver?.status === 'disponible' || driver?.status === 'hors_ligne';

  async function handleToggle(value: boolean) {
    if (!driver) return;

    setToggling(true);
    const nextStatus: DriverStatus = value ? 'disponible' : 'hors_ligne';
    await supabase.from('drivers').update({ status: nextStatus }).eq('id', driver.id);
    await refreshDriver();
    setToggling(false);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Profil" />

        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile?.full_name ?? null)}</Text>
          </View>
          <View style={styles.profileTexts}>
            <Text style={styles.profileName}>{profile?.full_name || 'Livreur SECULIV'}</Text>
            <Text style={styles.profileSubtitle}>{profile?.phone || '—'} · Livreur</Text>
            {avgRating !== null && (
              <View style={styles.ratingRow}>
                <Star size={12} color={colors.gold} fill={colors.gold} />
                <Text style={styles.ratingText}>{avgRating.toFixed(1)} / 5 · avis clients</Text>
              </View>
            )}
          </View>
        </Card>

        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Statut</Text>
            {driver && <Pill label={DRIVER_STATUS_INFO[driver.status].label} tone={DRIVER_STATUS_INFO[driver.status].tone} />}
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              {canToggle ? 'Disponible pour de nouvelles courses' : 'Géré automatiquement pendant une course'}
            </Text>
            <Switch
              value={isOnline}
              onValueChange={handleToggle}
              disabled={!canToggle || toggling}
              trackColor={{ false: colors.line, true: colors.greenSoft }}
              thumbColor={isOnline ? colors.green : colors.muted}
            />
          </View>
        </Card>

        <Card style={styles.rowsCard}>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowIcon}>
              <Bike size={18} color={colors.navy} />
            </View>
            <Text style={styles.rowLabel}>Plaque moto</Text>
            <Text style={styles.rowValue}>{driver?.moto_plate || '—'}</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowIcon}>
              {driver?.is_verified ? (
                <ShieldCheck size={18} color={colors.green} />
              ) : (
                <ShieldX size={18} color={colors.muted} />
              )}
            </View>
            <Text style={styles.rowLabel}>Vérification</Text>
            <Text style={styles.rowValue}>{driver?.is_verified ? 'Vérifié' : 'En attente'}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/history')}
          >
            <View style={styles.rowIcon}>
              <Clock size={18} color={colors.navy} />
            </View>
            <Text style={styles.rowLabel}>Historique des courses</Text>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/notifications-settings')}
          >
            <View style={styles.rowIcon}>
              <Bell size={18} color={colors.navy} />
            </View>
            <Text style={styles.rowLabel}>Notifications</Text>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        </Card>

        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
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
    flex: 1,
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: colors.gold,
    fontWeight: '600',
  },
  statusCard: {
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabel: {
    flex: 1,
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
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
});
