import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { SectionTitle } from '@/src/components/SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';
import type { Order } from '@/src/types';

function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(fcfa: number): string {
  return `${fcfa.toLocaleString('fr-FR')} F`;
}

export default function DriverActivityScreen() {
  const { driver } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!driver) return;

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', driver.id)
      .eq('status', 'livree')
      .order('updated_at', { ascending: false });

    if (fetchError) {
      setError('Impossible de charger ton activité. Vérifie ta connexion et réessaie.');
      setLoading(false);
      return;
    }

    setOrders((data ?? []) as Order[]);
    setLoading(false);
  }, [driver]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.green} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Réessayer" variant="ghost" onPress={loadOrders} />
        </View>
      </SafeAreaView>
    );
  }

  const totalEarnings = orders.reduce((sum, order) => sum + order.price_fcfa, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Activité" />

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <CheckCircle2 size={20} color={colors.green} />
            <Text style={styles.statValue}>{orders.length}</Text>
            <Text style={styles.statLabel}>Livraisons</Text>
          </Card>
          <Card style={styles.statCard}>
            <ShieldCheck size={20} color={colors.navy} />
            <Text style={styles.statValue}>{driver?.trust_score ?? '—'}</Text>
            <Text style={styles.statLabel}>Score de confiance</Text>
          </Card>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Aucune livraison terminée</Text>
            <Text style={styles.emptySubtitle}>Ton historique apparaîtra ici après ta première livraison.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {orders.map((order) => (
              <Card key={order.id} style={styles.historyRow}>
                <View style={styles.historyTexts}>
                  <Text style={styles.historyId}>{formatOrderId(order.id)}</Text>
                  <Text style={styles.historyAddress}>{order.dropoff.address}</Text>
                  <Text style={styles.historyDate}>{formatDate(order.updated_at)}</Text>
                </View>
                <Text style={styles.historyPrice}>{formatPrice(order.price_fcfa)}</Text>
              </Card>
            ))}
          </View>
        )}

        {orders.length > 0 && (
          <Text style={styles.totalText}>Total perçu (avant commission) : {formatPrice(totalEarnings)}</Text>
        )}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  historyList: {
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTexts: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  historyId: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  historyAddress: {
    fontSize: 12,
    color: colors.muted,
  },
  historyDate: {
    fontSize: 12,
    color: colors.muted,
  },
  historyPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  totalText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
});
