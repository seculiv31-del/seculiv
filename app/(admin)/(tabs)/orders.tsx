import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle, Eye, FileDown, Lock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import {
  assignOrder,
  listAssignableDrivers,
  listOrders,
  type AssignableDriver,
  type OrderRow,
} from '@/src/lib/admin';
import { downloadCertificate, getCertificate } from '@/src/lib/certificate';
import { getOrderStatusInfo } from '@/src/lib/orderStatus';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { OrderStatus } from '@/src/types';

// Violet du mode sensible (identique aux autres écrans du flow).
const VIOLET = '#6B4FA8';

const STATUS_FILTERS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'Toutes',     value: 'all'         },
  { label: 'En attente', value: 'en_attente'  },
  { label: 'Assignée',   value: 'assignee'    },
  { label: 'En transit', value: 'en_transport' },
  { label: 'Livrée',     value: 'livree'      },
  { label: 'Annulée',    value: 'annulee'     },
];

function formatOrderId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminOrdersScreen() {
  const [filter, setFilter]         = useState<OrderStatus | 'all'>('all');
  const [orders, setOrders]         = useState<OrderRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [drivers, setDrivers]       = useState<AssignableDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [assigning, setAssigning]   = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [certLoadingId, setCertLoadingId] = useState<string | null>(null);
  // ID de la commande dont on charge la photo de pièce d'identité (admin uniquement).
  const [idViewLoadingId, setIdViewLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await listOrders(filter === 'all' ? undefined : filter);
    if (data) setOrders(data);
    else setError('Impossible de charger les commandes.');
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openAssign(orderId: string) {
    setAssigningId(orderId);
    setAssignError(null);
    setDriversLoading(true);
    const data = await listAssignableDrivers();
    setDrivers(data);
    setDriversLoading(false);
  }

  function closeAssign() {
    setAssigningId(null);
    setDrivers([]);
    setAssignError(null);
  }

  async function handleDownloadCert(orderId: string) {
    setCertLoadingId(orderId);
    try {
      const cert = await getCertificate(orderId);
      if (!cert) {
        Alert.alert('Certificat', 'En cours de génération, réessayez dans un instant.');
        return;
      }
      await downloadCertificate(cert.id, cert.pdf_path);
    } catch (e) {
      Alert.alert('Certificat', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setCertLoadingId(null);
    }
  }

  // Charge une signed URL (5 min) pour la photo de pièce d'identité via Edge Function.
  // Chaque accès est journalisé dans audit_log (traçabilité CDP Sénégal).
  // La photo ne transite jamais par le livreur ni le client — admin uniquement.
  async function handleViewId(orderId: string) {
    setIdViewLoadingId(orderId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-view-id', {
        body: { order_id: orderId },
      });
      if (error || !data?.signed_url) {
        Alert.alert('Pièce d\'identité', error?.message ?? data?.error ?? 'Impossible de charger la photo.');
        return;
      }
      // La signed URL expire dans 5 minutes (300 s).
      Alert.alert(
        'Pièce d\'identité — accès admin tracé',
        `URL valide 5 minutes :\n\n${data.signed_url}\n\nVérifiée le : ${data.id_verified_at ? new Date(data.id_verified_at).toLocaleString('fr-FR') : 'N/A'}`,
        [{ text: 'Fermer' }],
      );
    } catch (e) {
      Alert.alert('Pièce d\'identité', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setIdViewLoadingId(null);
    }
  }

  async function handleAssign(orderId: string, driverId: string) {
    setAssigning(true);
    setAssignError(null);
    const err = await assignOrder(orderId, driverId);
    if (err) {
      setAssignError(err);
      setAssigning(false);
      return;
    }

    // Push au livreur : nouvelle course assignée (fire-and-forget)
    supabase
      .from('drivers')
      .select('profile_id')
      .eq('id', driverId)
      .single()
      .then(({ data }) => {
        if (data?.profile_id) {
          supabase.functions.invoke('send-push', {
            body: {
              profile_id: data.profile_id,
              title: '🆕 Nouvelle course assignée',
              body: 'Une livraison vous a été attribuée. Consultez l\'application.',
              data: { screen: 'driver-courses', orderId },
              category: 'delivery',
            },
          });
        }
      });

    setAssigning(false);
    closeAssign();
    load();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Livraisons" />

        {/* Filtres */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.filterPill, filter === f.value && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Réessayer" variant="ghost" onPress={load} />
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Aucune commande pour ce filtre.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((order) => {
              const status = getOrderStatusInfo(order.status);
              const isAssigning = assigningId === order.id;
              return (
                <View key={order.id}>
                  <Card style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderId}>{formatOrderId(order.id)}</Text>
                      <Pill label={status.label} tone={status.tone} />
                    </View>
                    <Text style={styles.orderRoute} numberOfLines={1}>
                      {order.pickup.address} → {order.dropoff.address}
                    </Text>
                    <View style={styles.orderMeta}>
                      <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
                      <Text style={styles.orderPrice}>
                        {order.price_fcfa.toLocaleString('fr-FR')} F
                      </Text>
                    </View>
                    {order.driver_name ? (
                      <Text style={styles.orderDriver}>Livreur : {order.driver_name}</Text>
                    ) : order.status === 'en_attente' ? (
                      <Button
                        title="Assigner un livreur"
                        variant="ghost"
                        onPress={() => isAssigning ? closeAssign() : openAssign(order.id)}
                      />
                    ) : null}
                    {order.status === 'livree' && (
                      <Pressable
                        style={({ pressed }) => [styles.certBtn, pressed && styles.certBtnPressed, certLoadingId === order.id && styles.certBtnDisabled]}
                        onPress={() => handleDownloadCert(order.id)}
                        disabled={certLoadingId === order.id}
                      >
                        {certLoadingId === order.id
                          ? <ActivityIndicator size="small" color={colors.green} />
                          : <FileDown size={14} color={colors.green} />
                        }
                        <Text style={styles.certBtnText}>
                          {certLoadingId === order.id ? 'Chargement…' : 'Certificat'}
                        </Text>
                      </Pressable>
                    )}
                    {/* Bouton visible uniquement pour les livraisons sensibles avec photo uploadée.
                        L'accès est journalisé côté serveur (audit_log) via Edge Function. */}
                    {order.is_sensitive && order.id_photo_url && (
                      <Pressable
                        style={({ pressed }) => [styles.idBtn, pressed && styles.idBtnPressed, idViewLoadingId === order.id && styles.idBtnDisabled]}
                        onPress={() => handleViewId(order.id)}
                        disabled={idViewLoadingId === order.id}
                      >
                        {idViewLoadingId === order.id
                          ? <ActivityIndicator size="small" color={VIOLET} />
                          : <Eye size={14} color={VIOLET} />
                        }
                        <Lock size={12} color={VIOLET} />
                        <Text style={styles.idBtnText}>
                          {idViewLoadingId === order.id ? 'Chargement…' : 'Consulter la pièce'}
                        </Text>
                      </Pressable>
                    )}
                  </Card>

                  {/* Panel d'assignation inline */}
                  {isAssigning && (
                    <Card style={styles.assignPanel}>
                      <Text style={styles.assignTitle}>Choisir un livreur disponible</Text>
                      {driversLoading ? (
                        <ActivityIndicator color={colors.green} />
                      ) : drivers.length === 0 ? (
                        <Text style={styles.assignEmpty}>Aucun livreur disponible.</Text>
                      ) : (
                        drivers.map((driver) => (
                          <Pressable
                            key={driver.id}
                            style={({ pressed }) => [styles.driverOption, pressed && styles.driverOptionPressed]}
                            onPress={() => handleAssign(order.id, driver.id)}
                            disabled={assigning}
                          >
                            <View style={styles.driverOptionLeft}>
                              <Text style={styles.driverOptionName}>
                                {driver.full_name ?? 'Livreur'}
                              </Text>
                              <Text style={styles.driverOptionSub}>
                                {driver.moto_plate ?? '—'} · Score {driver.trust_score}
                              </Text>
                            </View>
                            <CheckCircle size={18} color={colors.green} />
                          </Pressable>
                        ))
                      )}
                      {assignError && (
                        <Text style={styles.assignError}>{assignError}</Text>
                      )}
                      <Button title="Annuler" variant="ghost" onPress={closeAssign} />
                    </Card>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: colors.bg },
  content:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered:    { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  errorText:   { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyText:   { fontSize: 14, color: colors.muted, textAlign: 'center' },
  filtersRow:  { flexGrow: 0, marginBottom: -spacing.sm },
  filterPill:  {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
    borderRadius:      radius.pill,
    backgroundColor:   colors.line,
    marginRight:       spacing.sm,
  },
  filterPillActive: { backgroundColor: colors.navy },
  filterText:       { fontSize: 13, fontWeight: '600', color: colors.muted },
  filterTextActive: { color: colors.white },
  list:          { gap: spacing.sm },
  orderCard:     { gap: spacing.sm },
  orderHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId:       { fontSize: 14, fontWeight: '700', color: colors.ink },
  orderRoute:    { fontSize: 13, color: colors.muted },
  orderMeta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderDate:     { fontSize: 12, color: colors.muted },
  orderPrice:    { fontSize: 13, fontWeight: '700', color: colors.navy },
  orderDriver:   { fontSize: 12, fontWeight: '600', color: colors.navy },
  assignPanel:   { gap: spacing.md, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#EFF2F6' },
  assignTitle:   { fontSize: 14, fontWeight: '700', color: colors.ink },
  assignEmpty:   { fontSize: 13, color: colors.muted },
  assignError:   { fontSize: 12, color: '#D14343' },
  driverOption:  {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
    padding:       spacing.md,
    borderRadius:  radius.md,
    backgroundColor: colors.white,
  },
  driverOptionPressed: { opacity: 0.7 },
  driverOptionLeft:    { flex: 1, gap: 2 },
  driverOptionName:    { fontSize: 14, fontWeight: '700', color: colors.ink },
  driverOptionSub:     { fontSize: 12, color: colors.muted },
  certBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
    marginTop: spacing.xs,
  },
  certBtnPressed: { opacity: 0.7 },
  certBtnDisabled: { opacity: 0.5 },
  certBtnText: { fontSize: 13, fontWeight: '600', color: colors.green },
  // Bouton "Consulter la pièce" — admin uniquement, accès tracé
  idBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D9CEEF',
    backgroundColor: '#F0ECFA',
    marginTop: spacing.xs,
  },
  idBtnPressed:  { opacity: 0.7 },
  idBtnDisabled: { opacity: 0.5 },
  idBtnText: { fontSize: 13, fontWeight: '600', color: VIOLET },
});
