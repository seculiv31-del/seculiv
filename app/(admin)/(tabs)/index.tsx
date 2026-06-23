import { useFocusEffect } from '@react-navigation/native';
import { Bike, Circle, Clock, Package, Radio } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import DeliveryMap from '@/src/components/DeliveryMap';
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import { getOrderStatusInfo } from '@/src/lib/orderStatus';
import { supabase } from '@/src/lib/supabase';
import { useRealtimePosition } from '@/src/lib/useRealtimePosition';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Order, PaymentStatus } from '@/src/types';

type ActiveOrder = Order & { driver_name: string | null };

function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

const PAYMENT_BADGE: Record<PaymentStatus, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  paye:       { label: 'Payé',     tone: 'green' },
  en_attente: { label: 'Attente',  tone: 'amber' },
  probleme:   { label: 'Problème', tone: 'red'   },
};

export default function AdminHomeScreen() {
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [recentPayments, setRecentPayments] = useState<ActiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paidToday, setPaidToday] = useState(0);
  const [pendingPayTotal, setPendingPayTotal] = useState(0);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*, profiles:driver_id(full_name)')
      .not('status', 'in', '(livree,annulee)')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Impossible de charger les commandes.');
      setLoading(false);
      return;
    }

    const toRow = (row: Order & { profiles?: { full_name: string | null } | null }): ActiveOrder => ({
      ...row,
      driver_name: row.profiles?.full_name ?? null,
    });

    setOrders((data ?? []).map(toRow) as ActiveOrder[]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: paidRows } = await supabase
      .from('orders')
      .select('price_fcfa')
      .eq('payment_status', 'paye')
      .not('paid_at', 'is', null)
      .gte('paid_at', todayStart.toISOString());
    setPaidToday((paidRows ?? []).reduce((sum, o) => sum + (o.price_fcfa as number), 0));

    const { data: pendingRows } = await supabase
      .from('orders')
      .select('price_fcfa')
      .eq('payment_status', 'en_attente');
    setPendingPayTotal((pendingRows ?? []).reduce((sum, o) => sum + (o.price_fcfa as number), 0));

    const { data: payRows } = await supabase
      .from('orders')
      .select('*, profiles:driver_id(full_name)')
      .eq('status', 'livree')
      .order('updated_at', { ascending: false })
      .limit(10);
    setRecentPayments((payRows ?? []).map(toRow) as ActiveOrder[]);

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  const { allPositions } = useRealtimePosition({ allActive: true });

  const allDrivers = orders
    .filter((o) => allPositions.has(o.id))
    .map((o) => {
      const pos = allPositions.get(o.id)!;
      return { id: o.id, name: o.driver_name ?? undefined, lat: pos.lat, lng: pos.lng, status: o.status };
    });

  const waitingCount  = orders.filter((o) => o.status === 'en_attente').length;
  const inTransitCount = orders.filter((o) => o.status === 'en_transport').length;
  const liveCount     = allDrivers.length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Dashboard" />

        <View style={styles.kpiRow}>
          <KpiCard icon={<Package size={18} color={colors.navy} />} value={orders.length} label="Actives" />
          <KpiCard icon={<Bike size={18} color={colors.green} />} value={inTransitCount} label="En transit" />
          <KpiCard icon={<Radio size={18} color={colors.green} />} value={liveCount} label="GPS live" />
          <KpiCard icon={<Clock size={18} color={colors.gold} />} value={waitingCount} label="En attente" />
        </View>

        <Card style={styles.payCard}>
          <Text style={styles.payCardTitle}>Paiements du jour</Text>
          <View style={styles.payRow}>
            <View style={styles.payCol}>
              <Text style={[styles.payAmount, { color: colors.green }]}>
                {paidToday.toLocaleString('fr-FR')} F
              </Text>
              <Text style={styles.payColLabel}>Encaissé</Text>
            </View>
            <View style={styles.payDivider} />
            <View style={styles.payCol}>
              <Text style={[styles.payAmount, { color: colors.gold }]}>
                {pendingPayTotal.toLocaleString('fr-FR')} F
              </Text>
              <Text style={styles.payColLabel}>En attente</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.mapCard}>
          <Text style={styles.mapTitle}>Positions en temps réel</Text>
          {allDrivers.length > 0 ? (
            <DeliveryMap mode="admin" allDrivers={allDrivers} />
          ) : (
            <View style={styles.mapEmpty}>
              <Circle size={16} color={colors.muted} />
              <Text style={styles.mapEmptyText}>
                {"Aucun livreur ne diffuse sa position pour l'instant."}
              </Text>
            </View>
          )}
        </Card>

        {recentPayments.length > 0 && (
          <>
            <SectionTitle title="Paiements récents" />
            <View style={styles.courseList}>
              {recentPayments.map((order) => (
                <PaymentRow key={order.id} order={order} />
              ))}
            </View>
          </>
        )}

        {orders.length > 0 && (
          <>
            <SectionTitle title="Courses en cours" />
            <View style={styles.courseList}>
              {orders.map((order) => (
                <CourseRow key={order.id} order={order} hasLiveGps={allPositions.has(order.id)} />
              ))}
            </View>
          </>
        )}

        {orders.length === 0 && recentPayments.length === 0 && (
          <View style={styles.emptyBlock}>
            <Package size={36} color={colors.muted} />
            <Text style={styles.emptyText}>Aucune commande active en ce moment.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card style={styles.kpi}>
      {icon}
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Card>
  );
}

function CourseRow({ order, hasLiveGps }: { order: ActiveOrder; hasLiveGps: boolean }) {
  const status = getOrderStatusInfo(order.status);
  return (
    <Card style={styles.courseRow}>
      <View style={styles.courseLeft}>
        <Text style={styles.courseId}>{formatOrderId(order.id)}</Text>
        <Text style={styles.courseAddress} numberOfLines={1}>{order.dropoff.address}</Text>
        {order.driver_name && <Text style={styles.courseDriver}>{order.driver_name}</Text>}
      </View>
      <View style={styles.courseRight}>
        <Pill label={status.label} tone={status.tone} />
        {order.eta_minutes != null && (
          <Text style={styles.courseEta}>{order.eta_minutes} min</Text>
        )}
        {hasLiveGps && <View style={styles.gpsDot} />}
      </View>
    </Card>
  );
}

function PaymentRow({ order }: { order: ActiveOrder }) {
  const badge = PAYMENT_BADGE[order.payment_status];
  return (
    <Card style={styles.courseRow}>
      <View style={styles.courseLeft}>
        <Text style={styles.courseId}>{formatOrderId(order.id)}</Text>
        {order.driver_name && <Text style={styles.courseDriver}>{order.driver_name}</Text>}
      </View>
      <View style={styles.courseRight}>
        <Pill label={badge.label} tone={badge.tone} />
        <Text style={styles.paymentAmount}>{order.price_fcfa.toLocaleString('fr-FR')} F</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safeArea:       { flex: 1, backgroundColor: colors.bg },
  content:        { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  errorText:      { fontSize: 14, color: colors.muted, textAlign: 'center' },
  kpiRow:         { flexDirection: 'row', gap: spacing.sm },
  kpi:            { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, paddingHorizontal: 0 },
  kpiValue:       { fontSize: 20, fontWeight: '800', color: colors.ink },
  kpiLabel:       { fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  mapCard:        { gap: spacing.sm },
  mapTitle:       { fontSize: 14, fontWeight: '700', color: colors.ink },
  mapEmpty:       { height: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: '#D7DEEA', borderRadius: radius.md },
  mapEmptyText:   { fontSize: 13, color: colors.muted },
  courseList:     { gap: spacing.sm },
  courseRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  courseLeft:     { flex: 1, gap: 2 },
  courseId:       { fontSize: 13, fontWeight: '700', color: colors.ink },
  courseAddress:  { fontSize: 12, color: colors.muted },
  courseDriver:   { fontSize: 12, fontWeight: '600', color: colors.navy },
  courseRight:    { alignItems: 'flex-end', gap: spacing.xs },
  courseEta:      { fontSize: 11, color: colors.muted },
  gpsDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  paymentAmount:  { fontSize: 12, fontWeight: '700', color: colors.ink },
  emptyBlock:     { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  emptyText:      { fontSize: 14, color: colors.muted, textAlign: 'center' },
  payCard:        { gap: spacing.sm },
  payCardTitle:   { fontSize: 14, fontWeight: '700', color: colors.ink },
  payRow:         { flexDirection: 'row', alignItems: 'center' },
  payCol:         { flex: 1, alignItems: 'center', gap: 2 },
  payAmount:      { fontSize: 20, fontWeight: '800' },
  payColLabel:    { fontSize: 10, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  payDivider:     { width: 1, height: 40, backgroundColor: colors.line },
});
