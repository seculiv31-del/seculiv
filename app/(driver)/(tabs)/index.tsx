import { useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer } from 'expo-audio';
import * as Location from 'expo-location';
import {
  Banknote, CheckCircle2, ChevronRight, Clock, KeyRound, Lock, MapPin,
  MessageSquare, Navigation, Package, Pause, PenLine, Phone, Play, Radio,
  RefreshCw, Shield, Volume2, VolumeX,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import DeliveryMap from '@/src/components/DeliveryMap';
import IdVerification from '@/src/components/IdVerification';
import PhotoCapture from '@/src/components/PhotoCapture';
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import SignaturePad from '@/src/components/SignaturePad';
import { TextField } from '@/src/components/TextField';
import { useAuth } from '@/src/lib/AuthContext';
import { getDriverAction } from '@/src/lib/driverActions';
import { useGpsTracking } from '@/src/lib/useGpsTracking';
import { useVoiceGuidance } from '@/src/lib/useVoiceGuidance';
import { getOrderStatusInfo, PARCEL_TYPE_LABELS } from '@/src/lib/orderStatus';
import { supabase } from '@/src/lib/supabase';
import { uploadSignature } from '@/src/lib/uploadSignature';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Order } from '@/src/types';

const VIOLET = '#6B4FA8';
const VIOLET_SOFT = '#F0ECFA';

const GPS_ACTIVE_STATUSES: Order['status'][] = ['enlevement', 'en_transport', 'arrivee'];

type SensStep = 'code_exp' | 'code_dest' | 'id_scan' | null;

function formatOrderId(id: string): string { return `#${id.slice(0, 8).toUpperCase()}`; }
function formatPrice(fcfa: number): string { return `${fcfa.toLocaleString('fr-FR')} F`; }

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
    Math.cos((b.latitude * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pickupDistanceKm(
  order: Order,
  pos: { latitude: number; longitude: number } | null,
): number | null {
  if (!pos || order.pickup.lat == null || order.pickup.lng == null) return null;
  return haversineKm(pos, { latitude: order.pickup.lat, longitude: order.pickup.lng });
}

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ─── Bandeau instruction vocale ──────────────────────────────────────────────

function VoiceBanner({
  instruction, distanceMeters, error, enabled, onToggle,
}: {
  instruction: string | null;
  distanceMeters: number | null;
  error: string | null;
  enabled: boolean;
  onToggle: () => void;
}) {
  const distLabel =
    distanceMeters !== null && distanceMeters > 15
      ? distanceMeters < 1000
        ? `${Math.round(distanceMeters / 10) * 10} m`
        : `${(distanceMeters / 1000).toFixed(1)} km`
      : null;

  return (
    <View style={voiceStyles.row}>
      <View style={[voiceStyles.banner, !enabled && voiceStyles.bannerOff]}>
        <Navigation size={16} color={enabled ? colors.green : colors.muted} />
        <View style={voiceStyles.bannerTexts}>
          {error ? (
            <Text style={voiceStyles.errorText}>{error}</Text>
          ) : enabled && instruction ? (
            <>
              {distLabel && <Text style={voiceStyles.dist}>{distLabel}</Text>}
              <Text style={voiceStyles.instruction} numberOfLines={2}>{instruction}</Text>
            </>
          ) : (
            <Text style={voiceStyles.offText}>
              {enabled ? "Calcul de l'itinéraire…" : 'Guidage vocal désactivé'}
            </Text>
          )}
        </View>
      </View>
      <Pressable style={voiceStyles.toggleBtn} onPress={onToggle}>
        {enabled
          ? <Volume2 size={18} color={colors.green} />
          : <VolumeX  size={18} color={colors.muted} />
        }
      </Pressable>
    </View>
  );
}

const voiceStyles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  banner:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.greenSoft, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.green,
  },
  bannerOff: { backgroundColor: '#F4F5F7', borderColor: colors.line },
  bannerTexts: { flex: 1, gap: 1 },
  dist:        { fontSize: 11, fontWeight: '700', color: colors.green, textTransform: 'uppercase' },
  instruction: { fontSize: 13, fontWeight: '600', color: colors.ink },
  offText:     { fontSize: 13, color: colors.muted },
  errorText:   { fontSize: 12, color: '#D14343' },
  toggleBtn: {
    width: 38, height: 38, borderRadius: radius.sm,
    backgroundColor: '#F4F5F7', borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Badge GPS pulsant ────────────────────────────────────────────────────────

function GpsBadge({ isTracking }: { isTracking: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isTracking) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isTracking, pulse]);

  if (!isTracking) return null;

  return (
    <View style={badgeStyles.row}>
      <View style={badgeStyles.gps}>
        <Animated.View style={[badgeStyles.dot, { opacity: pulse }]} />
        <Radio size={12} color={colors.green} />
        <Text style={badgeStyles.gpsText}>GPS actif · diffusion toutes les 5s</Text>
      </View>
      <View style={badgeStyles.ai}>
        <Shield size={12} color={colors.navy} />
        <Text style={badgeStyles.aiText}>Surveillance IA active</Text>
      </View>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  row:  { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  gps:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.greenSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  dot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  gpsText: { fontSize: 11, fontWeight: '700', color: colors.green },
  ai:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8EDF5', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  aiText: { fontSize: 11, fontWeight: '700', color: colors.navy },
});

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function DriverCoursesScreen() {
  const { driver, refreshDriver } = useAuth();
  const [orders, setOrders]               = useState<Order[]>([]);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [driverPosition, setDriverPosition]   = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [accepting, setAccepting]         = useState<string | null>(null);
  const [codeInput, setCodeInput]         = useState('');
  const [actionError, setActionError]     = useState<string | null>(null);
  const [paymentError, setPaymentError]   = useState<string | null>(null);
  const [updating, setUpdating]           = useState(false);
  const [paymentUpdating, setPaymentUpdating] = useState(false);

  const [signatureStep, setSignatureStep]     = useState<'pad' | null>(null);
  const [recipientName, setRecipientName]     = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signatureError, setSignatureError]   = useState<string | null>(null);

  const [sensStep, setSensStep] = useState<SensStep>(null);

  const loadOrders = useCallback(async () => {
    if (!driver) return;
    setLoading(true);
    setError(null);

    const [myRes, availRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('driver_id', driver.id)
        .not('status', 'eq', 'annulee')
        .or('status.neq.livree,payment_status.eq.en_attente')
        .order('created_at', { ascending: true }),
      supabase
        .from('orders')
        .select('*')
        .eq('status', 'en_attente')
        .is('driver_id', null)
        .order('created_at', { ascending: true }),
    ]);

    if (myRes.error) {
      setError('Impossible de charger les courses. Vérifie ta connexion et réessaie.');
      setLoading(false);
      return;
    }

    if (availRes.error) {
      setError('Impossible de charger les courses disponibles. Vérifie ta connexion et réessaie.');
      setLoading(false);
      return;
    }

    setOrders((myRes.data ?? []) as Order[]);
    setAvailableOrders((availRes.data ?? []) as Order[]);
    setLoading(false);
  }, [driver]);

  const getDriverPosition = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverPosition({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadOrders();
    getDriverPosition();
  }, [loadOrders, getDriverPosition]));

  // Abonnement realtime : recharge automatiquement quand une commande est
  // créée ou modifiée (nouveau client, livreur qui accepte, etc.)
  useEffect(() => {
    if (!driver) return;

    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel('driver-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { loadOrders(); }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [driver, loadOrders]);

  // Trie les courses disponibles par distance croissante
  const sortedAvailableOrders = useMemo(() => {
    if (!driverPosition) return availableOrders;
    return [...availableOrders].sort((a, b) => {
      const da = pickupDistanceKm(a, driverPosition);
      const db = pickupDistanceKm(b, driverPosition);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [availableOrders, driverPosition]);

  const inProgressOrders = orders.filter((o) => o.status !== 'assignee');
  const queuedOrders     = orders.filter((o) => o.status === 'assignee');
  const current  = inProgressOrders[0] ?? queuedOrders[0] ?? null;
  const upcoming = orders.filter((o) => o.id !== current?.id);

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const isGpsActive = current ? GPS_ACTIVE_STATUSES.includes(current.status) : false;
  const { eta, isTracking, currentPosition, destinationCoords } = useGpsTracking({
    orderId: current?.id ?? '',
    active: isGpsActive,
    dropoffAddress: current?.dropoff.address ?? '',
  });

  const { nextInstruction, distanceToNext, routeError } = useVoiceGuidance(
    currentPosition,
    destinationCoords,
    voiceEnabled && isGpsActive
  );

  useEffect(() => {
    setCodeInput('');
    setActionError(null);
    setPaymentError(null);
    setSignatureStep(null);
    setRecipientName('');
    setSignatureError(null);
    if (current?.is_sensitive && current.status === 'arrivee') {
      setSensStep('code_exp');
    } else {
      setSensStep(null);
    }
  }, [current?.id]);

  // ── Accepter une course disponible ────────────────────────────────────────

  async function handleAcceptOrder(order: Order) {
    if (!driver) return;
    setAccepting(order.id);

    // Concurrence optimiste : on ne met à jour que si la course est encore libre
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ driver_id: driver.id, status: 'assignee' })
      .eq('id', order.id)
      .eq('status', 'en_attente')
      .is('driver_id', null)
      .select();

    if (updateErr || !updated || updated.length === 0) {
      setAccepting(null);
      Alert.alert('Course non disponible', 'Cette course vient d\'être assignée à un autre livreur. La liste a été mise à jour.');
      await loadOrders();
      return;
    }

    await supabase.from('drivers').update({ status: 'en_course' }).eq('id', driver.id);
    await refreshDriver();

    supabase.functions.invoke('send-push', {
      body: {
        profile_id: order.client_id,
        title: '🏍️ Livreur assigné',
        body: 'Un livreur a accepté votre commande et vient chercher votre colis.',
        data: { orderId: order.id },
        category: 'delivery',
      },
    }).catch(() => {});

    setAccepting(null);
    await loadOrders();
  }

  // ── Avancer le statut standard ────────────────────────────────────────────

  async function handleAdvance(order: Order) {
    const action = getDriverAction(order.status);
    if (!action || !driver) return;
    setActionError(null);
    setUpdating(true);
    const { error: updateError } = await supabase.from('orders').update({ status: action.nextStatus }).eq('id', order.id);
    if (updateError) { setUpdating(false); setActionError('La mise à jour a échoué. Vérifie ta connexion et réessaie.'); return; }

    if (action.nextDriverStatus) {
      const { error: driverError } = await supabase.from('drivers').update({ status: action.nextDriverStatus }).eq('id', driver.id);
      if (driverError) {
        setUpdating(false);
        setActionError("La commande est mise à jour mais ton statut n'a pas pu être changé. Mets-le à jour depuis \"Mon compte\".");
        await loadOrders(); return;
      }
      await refreshDriver();
    }

    if (action.nextStatus === 'en_transport') {
      supabase.functions.invoke('send-push', { body: { profile_id: order.client_id, title: '🏍️ Votre livreur arrive', body: 'Votre colis est en route. Préparez votre code secret.', data: { orderId: order.id }, category: 'proximity' } }).catch(() => {});
    }
    if (action.nextStatus === 'arrivee') {
      supabase.functions.invoke('send-push', { body: { profile_id: order.client_id, title: '📍 Votre livreur est arrivé', body: 'Communiquez votre code secret au livreur pour finaliser la livraison.', data: { orderId: order.id }, category: 'delivery' } }).catch(() => {});
      if (order.is_sensitive) setSensStep('code_exp');
    }

    setUpdating(false);
    await loadOrders();
  }

  async function handleValidateCode(order: Order) {
    const code = codeInput.trim();
    if (code.length !== 4) { setActionError('Entre le code à 4 chiffres communiqué par le destinataire.'); return; }
    setActionError(null);
    setUpdating(true);
    const { data: isValid, error: validateError } = await supabase.rpc('validate_secret_code', { p_order_id: order.id, p_code: code });
    if (validateError) { setUpdating(false); setActionError('La vérification du code a échoué. Vérifie ta connexion et réessaie.'); return; }
    if (!isValid) { setUpdating(false); setActionError('Code incorrect. Demande au destinataire de te communiquer le bon code.'); return; }
    const { error: updateError } = await supabase.from('orders').update({ status: 'livree' }).eq('id', order.id);
    if (updateError) { setUpdating(false); setActionError('Code correct mais la mise à jour a échoué. Réessaie.'); return; }
    supabase.functions.invoke('send-push', { body: { profile_id: order.client_id, title: '✅ Livraison validée', body: 'Votre colis a bien été remis. Le certificat sera disponible après le paiement.', data: { orderId: order.id }, category: 'delivery' } }).catch(() => {});
    setCodeInput('');
    setUpdating(false);
    await loadOrders();
  }

  async function handleValidateSensitiveCode(order: Order, codeType: 'expediteur' | 'destinataire') {
    const code = codeInput.trim();
    if (code.length !== 4) { setActionError('Entre le code à 4 chiffres.'); return; }
    setActionError(null);
    setUpdating(true);
    const { data, error: fnErr } = await supabase.functions.invoke('verify-delivery-code', {
      body: { order_id: order.id, code, code_type: codeType },
    });
    setUpdating(false);
    if (fnErr || !data?.valid) {
      setActionError(data?.error ?? 'Code incorrect ou erreur réseau. Réessaie.');
      return;
    }
    setCodeInput('');
    if (codeType === 'expediteur') {
      setSensStep('code_dest');
    } else {
      setSensStep('id_scan');
    }
  }

  async function handleIdVerified(order: Order) {
    setUpdating(true);
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'livree' })
      .eq('id', order.id);
    setUpdating(false);
    if (updateErr) {
      setActionError('Mise à jour du statut échouée. Réessaie.');
      return;
    }
    setSensStep(null);
    supabase.functions.invoke('send-push', {
      body: {
        profile_id: order.client_id,
        title: '🔒 Remise sécurisée validée',
        body: 'Tous les contrôles renforcés sont passés. Votre colis a été remis en toute sécurité.',
        data: { orderId: order.id },
        category: 'delivery',
      },
    }).catch(() => {});
    await loadOrders();
  }

  async function handleSignatureOK(order: Order, base64DataUrl: string) {
    const name = recipientName.trim() || order.dropoff.name || 'Destinataire';
    setSignatureError(null);
    setSignatureUploading(true);
    const result = await uploadSignature(order.id, base64DataUrl, name);
    setSignatureUploading(false);
    if ('error' in result) { setSignatureError(result.error); return; }
    setSignatureStep(null);
    setRecipientName('');
    await loadOrders();
  }

  async function handleCollect(order: Order) {
    if (!driver) return;
    setPaymentError(null);
    setPaymentUpdating(true);
    const { error: payError } = await supabase.from('orders').update({ payment_status: 'paye', paid_at: new Date().toISOString() }).eq('id', order.id);
    if (payError) { setPaymentUpdating(false); setPaymentError('La confirmation du paiement a échoué. Réessaie.'); return; }
    supabase.functions.invoke('generate-certificate', { body: { order_id: order.id } }).catch(() => {});
    const { error: driverError } = await supabase.from('drivers').update({ status: 'disponible' }).eq('id', driver.id);
    if (driverError) {
      setPaymentUpdating(false);
      setPaymentError("Paiement enregistré mais ton statut n'a pas pu être mis à jour. Va dans \"Mon compte\" pour le corriger.");
      await loadOrders(); return;
    }
    await refreshDriver();
    setPaymentUpdating(false);
    await loadOrders();
  }

  async function handlePaymentProblem(order: Order) {
    if (!driver) return;
    setPaymentError(null);
    setPaymentUpdating(true);
    await supabase.from('incidents').insert({ order_id: order.id, reported_by: driver.profile_id, type: 'autre', description: 'Problème de paiement à la livraison' });
    const { error: payError } = await supabase.from('orders').update({ payment_status: 'probleme' }).eq('id', order.id);
    if (payError) { setPaymentUpdating(false); setPaymentError('Le signalement a échoué. Réessaie.'); return; }
    await supabase.from('drivers').update({ status: 'disponible' }).eq('id', driver.id);
    await refreshDriver();
    setPaymentUpdating(false);
    await loadOrders();
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

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

  if (!current && sortedAvailableOrders.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Package size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Aucune course disponible</Text>
          <Text style={styles.emptySubtitle}>Reste en ligne pour voir les nouvelles courses.</Text>
          <Button title="Actualiser" variant="ghost" onPress={() => { loadOrders(); getDriverPosition(); }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Course en cours ─────────────────────────────────────────────── */}
        {current && (
          <>
            <SectionTitle title="Course en cours" />
            <GpsBadge isTracking={isTracking} />
            {isGpsActive && (
              <VoiceBanner
                instruction={nextInstruction}
                distanceMeters={distanceToNext}
                error={routeError}
                enabled={voiceEnabled}
                onToggle={() => setVoiceEnabled((v) => !v)}
              />
            )}
            {isGpsActive && (
              <DeliveryMap
                mode="driver"
                driverName="Toi"
                eta={eta}
                driverPosition={
                  currentPosition
                    ? { lat: currentPosition.latitude, lng: currentPosition.longitude }
                    : undefined
                }
                pickup={
                  current.pickup.lat != null && current.pickup.lng != null
                    ? { lat: current.pickup.lat, lng: current.pickup.lng }
                    : undefined
                }
                dropoff={
                  current.dropoff.lat != null && current.dropoff.lng != null
                    ? { lat: current.dropoff.lat, lng: current.dropoff.lng, address: current.dropoff.address }
                    : destinationCoords
                      ? { lat: destinationCoords.latitude, lng: destinationCoords.longitude, address: current.dropoff.address }
                      : undefined
                }
              />
            )}
            <CurrentCourseCard
              order={current}
              codeInput={codeInput}
              onCodeChange={setCodeInput}
              actionError={actionError}
              paymentError={paymentError}
              updating={updating}
              paymentUpdating={paymentUpdating}
              signatureStep={signatureStep}
              recipientName={recipientName}
              signatureUploading={signatureUploading}
              signatureError={signatureError}
              sensStep={sensStep}
              onAdvance={() => handleAdvance(current)}
              onValidateCode={() => handleValidateCode(current)}
              onValidateSensitiveCode={(ct) => handleValidateSensitiveCode(current, ct)}
              onIdVerified={() => handleIdVerified(current)}
              onIdError={(msg) => setActionError(msg)}
              onCollect={() => handleCollect(current)}
              onPaymentProblem={() => handlePaymentProblem(current)}
              onPhotoSuccess={loadOrders}
              onSignatureMethodSelect={() => setSignatureStep('pad')}
              onRecipientNameChange={setRecipientName}
              onSignatureOK={(b64) => handleSignatureOK(current, b64)}
            />
          </>
        )}

        {/* ── Courses disponibles (tri par distance) ──────────────────────── */}
        {sortedAvailableOrders.length > 0 && (
          <>
            <View style={styles.availHeader}>
              <SectionTitle title={`Courses disponibles · ${sortedAvailableOrders.length}`} />
              <Pressable style={styles.refreshBtn} onPress={() => { loadOrders(); getDriverPosition(); }}>
                <RefreshCw size={14} color={colors.muted} />
              </Pressable>
            </View>
            {!driverPosition && (
              <View style={styles.locationBanner}>
                <MapPin size={13} color={colors.muted} />
                <Text style={styles.locationBannerText}>Localisation en cours pour trier par distance…</Text>
              </View>
            )}
            <View style={styles.availableList}>
              {sortedAvailableOrders.map((order) => (
                <AvailableOrderCard
                  key={order.id}
                  order={order}
                  distanceKm={pickupDistanceKm(order, driverPosition)}
                  onAccept={() => handleAcceptOrder(order)}
                  isAccepting={accepting === order.id}
                  driverSuspended={driver?.status === 'suspendu'}
                />
              ))}
            </View>
          </>
        )}

        {/* ── À venir (courses assignées en attente) ───────────────────────── */}
        {upcoming.length > 0 && (
          <>
            <SectionTitle title="À venir" />
            <View style={styles.upcomingList}>
              {upcoming.map((order) => <UpcomingRow key={order.id} order={order} />)}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── AvailableOrderCard ───────────────────────────────────────────────────────

function AvailableOrderCard({
  order, distanceKm, onAccept, isAccepting, driverSuspended,
}: {
  order: Order;
  distanceKm: number | null;
  onAccept: () => void;
  isAccepting: boolean;
  driverSuspended: boolean;
}) {
  const etaMin = distanceKm !== null
    ? Math.max(1, Math.round((distanceKm / 30) * 60))
    : null;

  return (
    <Card style={styles.availCard}>
      {/* En-tête : ID + badge distance */}
      <View style={styles.availCardHeader}>
        <View style={styles.availCardLeft}>
          <Text style={styles.availId}>{formatOrderId(order.id)}</Text>
          {order.is_sensitive && (
            <View style={styles.sensibleBadge}>
              <Lock size={10} color={VIOLET} />
              <Text style={styles.sensibleBadgeText}>Sensible</Text>
            </View>
          )}
        </View>
        {distanceKm !== null && (
          <View style={styles.distBadge}>
            <MapPin size={10} color={colors.green} />
            <Text style={styles.distText}>{formatDist(distanceKm)}</Text>
          </View>
        )}
      </View>

      {/* Tags : type + prix + ETA */}
      <View style={styles.tagsRow}>
        <Pill label={PARCEL_TYPE_LABELS[order.parcel_type]} tone="gray" />
        <Pill label={formatPrice(order.price_fcfa)} tone="navy" />
        {etaMin !== null && (
          <View style={styles.etaBadge}>
            <Clock size={10} color={colors.muted} />
            <Text style={styles.etaText}>~{etaMin} min</Text>
          </View>
        )}
      </View>

      {/* Itinéraire */}
      <View style={styles.routeBlock}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotPickup]} />
          <View style={styles.routeTexts}>
            <Text style={styles.routeLabel}>Enlèvement</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>{order.pickup.address}</Text>
            {order.pickup.notes ? (
              <Text style={styles.routeNotes} numberOfLines={1}>{order.pickup.notes}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.routeConnector} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, styles.routeDotDropoff]} />
          <View style={styles.routeTexts}>
            <Text style={styles.routeLabel}>Livraison</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>{order.dropoff.address}</Text>
            <View style={styles.routeContactRow}>
              <Text style={styles.routeContact}>{order.dropoff.name}</Text>
              <Pressable
                style={styles.routeCallBtn}
                onPress={() => Linking.openURL(`tel:${order.dropoff.phone}`)}
              >
                <Phone size={12} color={colors.green} />
                <Text style={styles.routePhone}>{order.dropoff.phone}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {driverSuspended ? (
        <View style={styles.suspendedNote}>
          <Text style={styles.suspendedNoteText}>Ton compte est suspendu. Contacte l&apos;admin pour reprendre.</Text>
        </View>
      ) : (
        <Button title="Accepter cette course" onPress={onAccept} loading={isAccepting} />
      )}
    </Card>
  );
}

// ─── CurrentCourseCard ────────────────────────────────────────────────────────

type CurrentCourseCardProps = {
  order: Order;
  codeInput: string;
  onCodeChange: (v: string) => void;
  actionError: string | null;
  paymentError: string | null;
  updating: boolean;
  paymentUpdating: boolean;
  signatureStep: 'pad' | null;
  recipientName: string;
  signatureUploading: boolean;
  signatureError: string | null;
  sensStep: SensStep;
  onAdvance: () => void;
  onValidateCode: () => void;
  onValidateSensitiveCode: (codeType: 'expediteur' | 'destinataire') => void;
  onIdVerified: () => void;
  onIdError: (msg: string) => void;
  onCollect: () => void;
  onPaymentProblem: () => void;
  onPhotoSuccess: () => void;
  onSignatureMethodSelect: () => void;
  onRecipientNameChange: (name: string) => void;
  onSignatureOK: (base64: string) => void;
};

function CurrentCourseCard({
  order, codeInput, onCodeChange,
  actionError, paymentError, updating, paymentUpdating,
  signatureStep, recipientName, signatureUploading, signatureError,
  sensStep,
  onAdvance, onValidateCode, onValidateSensitiveCode, onIdVerified, onIdError,
  onCollect, onPaymentProblem, onPhotoSuccess,
  onSignatureMethodSelect, onRecipientNameChange, onSignatureOK,
}: CurrentCourseCardProps) {
  const status  = getOrderStatusInfo(order.status);
  const action  = getDriverAction(order.status);

  const isEnlevement    = order.status === 'enlevement';
  const isArrivee       = order.status === 'arrivee';
  const isLivreePayPending = order.status === 'livree' && order.payment_status === 'en_attente';
  const needsPhotoAfter = isLivreePayPending && !order.photo_after_url;
  const needsSignature  = isLivreePayPending && !!order.photo_after_url && !order.signature_url;
  const needsPaymentConfirm = isLivreePayPending && !!order.photo_after_url && !!order.signature_url;

  const buttonDisabled   = isEnlevement && !order.photo_before_url;
  const showRegularButton = !!action && !isArrivee && !isLivreePayPending;
  const showSensitiveFlow = order.is_sensitive && isArrivee;

  return (
    <Card style={styles.currentCard}>
      <View style={styles.currentHeader}>
        <Text style={styles.currentId}>{formatOrderId(order.id)}</Text>
        <View style={styles.currentHeaderRight}>
          {order.is_sensitive && (
            <View style={styles.sensibleBadge}>
              <Lock size={10} color={VIOLET} />
              <Text style={styles.sensibleBadgeText}>Sensible</Text>
            </View>
          )}
          <Pill label={status.label} tone={status.tone} />
        </View>
      </View>

      <View style={styles.tagsRow}>
        <Pill label={PARCEL_TYPE_LABELS[order.parcel_type]} tone="gray" />
        <Pill label={formatPrice(order.price_fcfa)} tone="navy" />
      </View>

      <View style={styles.addressBlock}>
        <View style={styles.addressRow}>
          <MapPin size={18} color={colors.navy} style={styles.addressIcon} />
          <View style={styles.addressTexts}>
            <Text style={styles.addressLabel}>Enlèvement</Text>
            <Text style={styles.addressValue}>{order.pickup.address}</Text>
            {order.pickup.notes && <Text style={styles.addressNotes}>{order.pickup.notes}</Text>}
          </View>
        </View>
        {order.pickup.voice_guidance_url && (
          <VoiceGuidancePlayer
            storagePath={order.pickup.voice_guidance_url}
            label="instructions d'accès (enlèvement)"
          />
        )}
        <View style={styles.addressRow}>
          <MapPin size={18} color={colors.green} style={styles.addressIcon} />
          <View style={styles.addressTexts}>
            <Text style={styles.addressLabel}>Livraison</Text>
            <Text style={styles.addressValue}>{order.dropoff.address}</Text>
            {order.dropoff.notes && <Text style={styles.addressNotes}>{order.dropoff.notes}</Text>}
            <View style={styles.contactRow}>
              <Text style={styles.contactName}>{order.dropoff.name}</Text>
              <Pressable style={styles.callButton} onPress={() => Linking.openURL(`tel:${order.dropoff.phone}`)}>
                <Phone size={14} color={colors.green} />
                <Text style={styles.contactPhone}>{order.dropoff.phone}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        {order.dropoff.voice_guidance_url && (
          <VoiceGuidancePlayer
            storagePath={order.dropoff.voice_guidance_url}
            label="Message vocal de l'expéditeur"
          />
        )}
      </View>

      {isEnlevement && <PhotoCapture orderId={order.id} type="before" onSuccess={onPhotoSuccess} />}

      {showSensitiveFlow && (
        <SensitiveDeliveryFlow
          order={order}
          sensStep={sensStep}
          codeInput={codeInput}
          onCodeChange={onCodeChange}
          updating={updating}
          actionError={actionError}
          onValidateSensitiveCode={onValidateSensitiveCode}
          onIdVerified={onIdVerified}
          onIdError={onIdError}
        />
      )}

      {!order.is_sensitive && isArrivee && (
        <View style={styles.codeBlock}>
          <View style={styles.codeHeader}>
            <KeyRound size={16} color={colors.navy} />
            <Text style={styles.codeTitle}>Code de validation</Text>
          </View>
          <TextField
            label="Code communiqué par le destinataire"
            placeholder="••••"
            value={codeInput}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      )}

      {needsPhotoAfter && <PhotoCapture orderId={order.id} type="after" onSuccess={onPhotoSuccess} />}

      {needsSignature && signatureStep === null && (
        <SignatureMethodSection
          defaultName={order.dropoff.name}
          recipientName={recipientName}
          onNameChange={onRecipientNameChange}
          onSelectManuscrite={onSignatureMethodSelect}
          error={signatureError}
        />
      )}
      {needsSignature && signatureStep === 'pad' && (
        <View style={styles.sigPadBlock}>
          <SignaturePad
            recipientName={recipientName.trim() || order.dropoff.name}
            onOK={onSignatureOK}
          />
          {signatureUploading && <ActivityIndicator color={colors.green} style={{ marginTop: spacing.sm }} />}
          {signatureError && <Text style={styles.actionError}>{signatureError}</Text>}
        </View>
      )}

      {needsPaymentConfirm && (
        <EncaissementSection
          price={order.price_fcfa}
          isSensible={order.is_sensitive}
          error={paymentError}
          loading={paymentUpdating}
          onCollect={onCollect}
          onPaymentProblem={onPaymentProblem}
        />
      )}

      {actionError && <Text style={styles.actionError}>{actionError}</Text>}

      {showRegularButton && <Button title={action.label} onPress={onAdvance} loading={updating} disabled={buttonDisabled} />}
      {!order.is_sensitive && isArrivee && <Button title="Valider le code" onPress={onValidateCode} loading={updating} />}
    </Card>
  );
}

// ─── Flow renforcé sensible ───────────────────────────────────────────────────

type SensitiveDeliveryFlowProps = {
  order: Order;
  sensStep: SensStep;
  codeInput: string;
  onCodeChange: (v: string) => void;
  updating: boolean;
  actionError: string | null;
  onValidateSensitiveCode: (ct: 'expediteur' | 'destinataire') => void;
  onIdVerified: () => void;
  onIdError: (msg: string) => void;
};

function SensitiveDeliveryFlow({
  order, sensStep, codeInput, onCodeChange, updating, actionError,
  onValidateSensitiveCode, onIdVerified, onIdError,
}: SensitiveDeliveryFlowProps) {
  const steps = [
    { key: 'code_exp',  label: 'Code expéditeur'  },
    { key: 'code_dest', label: 'Code destinataire' },
    { key: 'id_scan',   label: 'Vérification identité' },
  ];

  const currentIdx = steps.findIndex((s) => s.key === sensStep);

  return (
    <View style={sensStyles.container}>
      <View style={sensStyles.header}>
        <Lock size={14} color={VIOLET} />
        <Text style={sensStyles.headerTitle}>Remise sécurisée</Text>
      </View>

      <View style={sensStyles.checklist}>
        {steps.map((s, i) => {
          const done    = i < currentIdx;
          const current = i === currentIdx;
          return (
            <View key={s.key} style={sensStyles.checkRow}>
              <View style={[
                sensStyles.checkDot,
                done    && sensStyles.checkDotDone,
                current && sensStyles.checkDotActive,
              ]}>
                {done
                  ? <CheckCircle2 size={14} color={VIOLET} />
                  : <Text style={[sensStyles.checkNum, current && sensStyles.checkNumActive]}>{i + 1}</Text>
                }
              </View>
              <Text style={[
                sensStyles.checkLabel,
                done    && sensStyles.checkLabelDone,
                current && sensStyles.checkLabelActive,
              ]}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>

      {sensStep === 'code_exp' && (
        <View style={sensStyles.stepBlock}>
          <Text style={sensStyles.stepTitle}>Code expéditeur</Text>
          <Text style={sensStyles.stepDesc}>Demandez à la personne présente le code à 4 chiffres de l&apos;expéditeur.</Text>
          <TextField
            label="Code expéditeur (4 chiffres)"
            placeholder="••••"
            value={codeInput}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            maxLength={4}
          />
          {actionError && <Text style={sensStyles.error}>{actionError}</Text>}
          <Button title="Valider le code expéditeur" onPress={() => onValidateSensitiveCode('expediteur')} loading={updating} />
        </View>
      )}

      {sensStep === 'code_dest' && (
        <View style={sensStyles.stepBlock}>
          <Text style={sensStyles.stepTitle}>Code destinataire</Text>
          <Text style={sensStyles.stepDesc}>Demandez au destinataire son code à 4 chiffres (reçu de l&apos;expéditeur).</Text>
          <TextField
            label="Code destinataire (4 chiffres)"
            placeholder="••••"
            value={codeInput}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            maxLength={4}
          />
          {actionError && <Text style={sensStyles.error}>{actionError}</Text>}
          <Button title="Valider le code destinataire" onPress={() => onValidateSensitiveCode('destinataire')} loading={updating} />
        </View>
      )}

      {sensStep === 'id_scan' && (
        <View style={sensStyles.stepBlock}>
          <IdVerification
            orderId={order.id}
            expectedIdType={order.expected_id_type}
            expectedIdName={order.expected_id_name}
            onSuccess={onIdVerified}
            onError={onIdError}
          />
          {updating && <ActivityIndicator color={VIOLET} style={{ marginTop: spacing.sm }} />}
          {actionError && <Text style={sensStyles.error}>{actionError}</Text>}
        </View>
      )}
    </View>
  );
}

const sensStyles = StyleSheet.create({
  container: {
    backgroundColor: VIOLET_SOFT, borderRadius: radius.md,
    borderWidth: 1, borderColor: '#D9CEEF',
    padding: spacing.md, gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: { fontSize: 13, fontWeight: '800', color: VIOLET },
  checklist: { gap: spacing.xs },
  checkRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkDot:  {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#D9CEEF',
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  checkDotDone:   { borderColor: VIOLET, backgroundColor: VIOLET_SOFT },
  checkDotActive: { borderColor: VIOLET, backgroundColor: VIOLET },
  checkNum: { fontSize: 10, fontWeight: '700', color: '#D9CEEF' },
  checkNumActive: { color: colors.white },
  checkLabel:       { fontSize: 12, color: colors.muted },
  checkLabelDone:   { color: VIOLET, textDecorationLine: 'line-through' as const },
  checkLabelActive: { fontSize: 13, fontWeight: '700', color: VIOLET },
  stepBlock: { gap: spacing.sm },
  stepTitle: { fontSize: 14, fontWeight: '700', color: VIOLET },
  stepDesc:  { fontSize: 12, color: colors.muted },
  error:     { fontSize: 12, color: '#D14343' },
});

// ─── Lecteur guidage vocal ────────────────────────────────────────────────────

function VoiceGuidancePlayer({ storagePath, label }: { storagePath: string; label?: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    supabase.storage
      .from('delivery-photos')
      .createSignedUrl(storagePath, 7200)
      .then(({ data }) => { if (data) setSignedUrl(data.signedUrl); });
  }, [storagePath]);

  const player    = useAudioPlayer(signedUrl ?? '');
  const isPlaying = player.playing;

  if (!signedUrl) return null;

  return (
    <Pressable
      style={vpStyles.btn}
      onPress={() => {
        if (isPlaying) {
          player.pause();
        } else {
          player.seekTo(0);
          player.play();
          setHasPlayed(true);
        }
      }}
    >
      {isPlaying ? <Pause size={16} color={colors.navy} /> : <Play size={16} color={colors.navy} />}
      <Text style={vpStyles.text}>
        {isPlaying
          ? 'Pause'
          : hasPlayed
            ? `Réécouter : ${label ?? "instructions d'accès"}`
            : `Écouter : ${label ?? "instructions d'accès"}`
        }
      </Text>
      <Volume2 size={14} color={colors.muted} />
    </Pressable>
  );
}

const vpStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: '#E8EDF5', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#C5D0E0',
    marginTop: spacing.xs,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.navy },
});

// ─── Encaissement ─────────────────────────────────────────────────────────────

function EncaissementSection({
  price, isSensible, error, loading, onCollect, onPaymentProblem,
}: {
  price: number;
  isSensible: boolean;
  error: string | null;
  loading: boolean;
  onCollect: () => void;
  onPaymentProblem: () => void;
}) {
  return (
    <View style={styles.encaissGap}>
      {isSensible && (
        <View style={styles.sensibleEncaissHeader}>
          <CheckCircle2 size={16} color={VIOLET} />
          <Text style={styles.sensibleEncaissText}>Remise sécurisée validée — tous les contrôles ont passé</Text>
        </View>
      )}
      <Card style={styles.encaissCard}>
        <Text style={styles.encaissLabel}>Montant à encaisser</Text>
        <Text style={styles.encaissAmount}>{price.toLocaleString('fr-FR')} F</Text>
        <Text style={styles.encaissMode}>Paiement en espèces</Text>
      </Card>
      <View style={styles.cashBox}>
        <Banknote size={18} color="#2E7D43" />
        <Text style={styles.cashBoxText}>Récupère {price.toLocaleString('fr-FR')} F auprès du destinataire avant de confirmer.</Text>
      </View>
      {error && <Text style={styles.actionError}>{error}</Text>}
      <Button title="Paiement reçu · finaliser" onPress={onCollect} loading={loading} />
      <Button title="Signaler un problème de paiement" variant="ghost" onPress={onPaymentProblem} loading={loading} />
    </View>
  );
}

// ─── Signature ────────────────────────────────────────────────────────────────

function SignatureMethodSection({ defaultName, recipientName, onNameChange, onSelectManuscrite, error }: {
  defaultName: string;
  recipientName: string;
  onNameChange: (name: string) => void;
  onSelectManuscrite: () => void;
  error: string | null;
}) {
  return (
    <View style={styles.sigSection}>
      <View style={styles.sigHeader}>
        <PenLine size={16} color={colors.navy} />
        <Text style={styles.sigTitle}>Signature du destinataire</Text>
      </View>
      <TextField label="Nom du destinataire" placeholder={defaultName} value={recipientName} onChangeText={onNameChange} />
      <Text style={styles.sigMethodLabel}>Mode de signature</Text>
      <Pressable style={styles.sigMethodRow} onPress={onSelectManuscrite}>
        <View style={styles.sigMethodIcon}><PenLine size={20} color={colors.navy} /></View>
        <View style={styles.sigMethodTexts}>
          <Text style={styles.sigMethodName}>Signature manuscrite</Text>
          <Text style={styles.sigMethodDesc}>Le destinataire signe à l&apos;écran</Text>
        </View>
        <ChevronRight size={16} color={colors.navy} />
      </Pressable>
      <View style={[styles.sigMethodRow, styles.sigMethodDisabled]}>
        <View style={styles.sigMethodIcon}><MessageSquare size={20} color={colors.muted} /></View>
        <View style={styles.sigMethodTexts}>
          <Text style={[styles.sigMethodName, styles.sigMethodNameDisabled]}>Code OTP SMS</Text>
          <Text style={styles.sigMethodDesc}>Envoi d&apos;un code au téléphone du destinataire</Text>
        </View>
        <View style={styles.soonBadge}><Text style={styles.soonText}>Bientôt</Text></View>
      </View>
      {error && <Text style={styles.actionError}>{error}</Text>}
    </View>
  );
}

// ─── UpcomingRow ──────────────────────────────────────────────────────────────

function UpcomingRow({ order }: { order: Order }) {
  const status = getOrderStatusInfo(order.status);
  return (
    <Card style={styles.upcomingRow}>
      <View style={styles.upcomingTexts}>
        <Text style={styles.upcomingId}>{formatOrderId(order.id)}</Text>
        <Text style={styles.upcomingAddress}>{order.dropoff.address}</Text>
      </View>
      <Pill label={status.label} tone={status.tone} />
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  emptySubtitle: { fontSize: 14, color: colors.muted, textAlign: 'center' },

  // Section header avec bouton refresh
  availHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },

  // Bannière position en cours
  locationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#F4F5F7', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  locationBannerText: { fontSize: 12, color: colors.muted },

  // Courses disponibles
  availableList: { gap: spacing.md },
  availCard: { gap: spacing.md },
  availCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  availCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  availId: { fontSize: 15, fontWeight: '700', color: colors.ink },
  distBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.greenSoft, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.green,
  },
  distText: { fontSize: 12, fontWeight: '700', color: '#2E7D43' },
  etaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F4F5F7', borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  etaText: { fontSize: 12, fontWeight: '600', color: colors.muted },

  // Itinéraire (disponibles)
  routeBlock: { gap: 0 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, flexShrink: 0 },
  routeDotPickup: { backgroundColor: colors.navy },
  routeDotDropoff: { backgroundColor: colors.green },
  routeConnector: {
    width: 2, height: 18, backgroundColor: colors.line,
    marginLeft: 5, marginVertical: 4,
  },
  routeTexts: { flex: 1, gap: 2, paddingBottom: spacing.xs },
  routeLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  routeAddress: { fontSize: 13, fontWeight: '600', color: colors.ink },
  routeNotes: { fontSize: 11, color: colors.muted },
  routeContactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  routeContact: { fontSize: 12, fontWeight: '700', color: colors.ink },
  routeCallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routePhone: { fontSize: 12, fontWeight: '700', color: colors.green },
  suspendedNote: {
    backgroundColor: '#FBE7E7', borderRadius: radius.md, padding: spacing.md,
  },
  suspendedNoteText: { fontSize: 12, color: '#D14343', fontWeight: '600' },

  // Course en cours
  currentCard: { gap: spacing.md },
  currentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  currentId: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sensibleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: VIOLET_SOFT, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: '#D9CEEF',
  },
  sensibleBadgeText: { fontSize: 10, fontWeight: '700', color: VIOLET },
  tagsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  addressBlock: { gap: spacing.md },
  addressRow: { flexDirection: 'row', gap: spacing.sm },
  addressIcon: { marginTop: 2 },
  addressTexts: { flex: 1, gap: 2 },
  addressLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  addressValue: { fontSize: 14, fontWeight: '600', color: colors.ink },
  addressNotes: { fontSize: 12, color: colors.muted },
  contactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  contactName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  callButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  contactPhone: { fontSize: 13, fontWeight: '700', color: colors.green },
  codeBlock: { gap: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codeTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  actionError: { fontSize: 12, color: '#D14343' },
  encaissGap: { gap: spacing.md },
  sensibleEncaissHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: VIOLET_SOFT, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#D9CEEF',
  },
  sensibleEncaissText: { flex: 1, fontSize: 12, fontWeight: '700', color: VIOLET },
  encaissCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  encaissLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  encaissAmount: { fontSize: 32, fontWeight: '800', color: colors.ink },
  encaissMode: { fontSize: 12, color: colors.muted },
  cashBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.greenSoft, borderRadius: radius.md, padding: spacing.md },
  cashBoxText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#2E7D43' },

  // À venir
  upcomingList: { gap: spacing.sm },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upcomingTexts: { gap: 2 },
  upcomingId: { fontSize: 14, fontWeight: '700', color: colors.ink },
  upcomingAddress: { fontSize: 12, color: colors.muted },

  // Signature
  sigSection: { gap: spacing.sm },
  sigHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sigTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sigMethodLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginTop: spacing.xs },
  sigMethodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  sigMethodDisabled: { opacity: 0.5 },
  sigMethodIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: '#E8EDF5', alignItems: 'center', justifyContent: 'center' },
  sigMethodTexts: { flex: 1, gap: 2 },
  sigMethodName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sigMethodNameDisabled: { color: colors.muted },
  sigMethodDesc: { fontSize: 12, color: colors.muted },
  soonBadge: { backgroundColor: colors.greenSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  soonText: { fontSize: 11, fontWeight: '700', color: colors.green },
  sigPadBlock: { gap: spacing.sm },
});
