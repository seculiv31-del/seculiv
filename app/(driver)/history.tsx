import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { useAuth } from '@/src/lib/AuthContext';
import { getOrderStatusInfo, PARCEL_TYPE_LABELS } from '@/src/lib/orderStatus';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Order } from '@/src/types';

function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(fcfa: number): string {
  return `${fcfa.toLocaleString('fr-FR')} F`;
}

export default function DriverHistoryScreen() {
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
      .order('updated_at', { ascending: false });

    if (fetchError) {
      setError('Impossible de charger votre historique. Vérifiez votre connexion.');
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

  const deliveredCount = orders.filter((o) => o.status === 'livree').length;
  const totalEarned = orders
    .filter((o) => o.status === 'livree')
    .reduce((sum, o) => sum + o.price_fcfa, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.navy} />
        </Pressable>
        <Text style={styles.title}>Historique des courses</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Réessayer" variant="ghost" onPress={loadOrders} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Aucune course pour l'instant</Text>
          <Text style={styles.emptySubtitle}>
            Votre historique de livraisons apparaîtra ici.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{deliveredCount}</Text>
              <Text style={styles.summaryLabel}>Livrées</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{formatPrice(totalEarned)}</Text>
              <Text style={styles.summaryLabel}>Total perçu</Text>
            </View>
          </View>

          <Text style={styles.count}>{orders.length} course{orders.length > 1 ? 's' : ''}</Text>

          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OrderCard({ order }: { order: Order }) {
  const status = getOrderStatusInfo(order.status);

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.orderId}>{formatOrderId(order.id)}</Text>
        <Pill label={status.label} tone={status.tone} />
      </View>

      <View style={styles.addresses}>
        <View style={styles.addressRow}>
          <View style={[styles.dot, styles.dotPickup]} />
          <Text style={styles.addressText} numberOfLines={1}>{order.pickup.address}</Text>
        </View>
        <View style={styles.line} />
        <View style={styles.addressRow}>
          <View style={[styles.dot, styles.dotDropoff]} />
          <Text style={styles.addressText} numberOfLines={1}>{order.dropoff.address}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.meta}>
          {PARCEL_TYPE_LABELS[order.parcel_type]} · {formatDate(order.updated_at)}
        </Text>
        <Text style={styles.price}>{formatPrice(order.price_fcfa)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  card: {
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderId: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  addresses: {
    gap: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotPickup: {
    backgroundColor: colors.navy,
  },
  dotDropoff: {
    backgroundColor: colors.green,
  },
  line: {
    width: 2,
    height: 10,
    backgroundColor: colors.line,
    marginLeft: 3,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
});
