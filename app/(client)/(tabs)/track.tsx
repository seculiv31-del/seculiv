import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { CheckCircle2, Circle, Clock, FileDown, KeyRound, MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { useDeliveryVoiceAlerts } from '@/src/lib/useDeliveryVoiceAlerts';
import { downloadCertificate, getCertificate } from '@/src/lib/certificate';
import { getOrderStatusInfo, getTrackingSteps, isOrderActive } from '@/src/lib/orderStatus';
import { getSecretCode } from '@/src/lib/secretCodes';
import { supabase } from '@/src/lib/supabase';
import { useRealtimePosition } from '@/src/lib/useRealtimePosition';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Certificate, Order } from '@/src/types';

// Statuts où le livreur diffuse sa position GPS.
const GPS_VISIBLE_STATUSES: Order['status'][] = ['enlevement', 'en_transport', 'arrivee'];

type PhotoUrls = { before?: string; after?: string };

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

export default function ClientTrackScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secretCodes, setSecretCodes] = useState<Record<string, string | null>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, PhotoUrls>>({});

  const loadOrders = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError("Impossible de charger tes commandes. Vérifie ta connexion et réessaie.");
      setLoading(false);
      return;
    }

    const loaded = (data ?? []) as Order[];
    setOrders(loaded);
    setLoading(false);

    // Génère des signed URLs fraîches (1h) pour chaque photo disponible.
    const withPhotos = loaded.filter((o) => o.photo_before_url || o.photo_after_url);
    if (withPhotos.length > 0) {
      const urls: Record<string, PhotoUrls> = {};
      await Promise.all(
        withPhotos.map(async (order) => {
          const entry: PhotoUrls = {};
          if (order.photo_before_url) {
            const { data: sd } = await supabase.storage
              .from('delivery-photos')
              .createSignedUrl(order.photo_before_url, 3600);
            if (sd) entry.before = sd.signedUrl;
          }
          if (order.photo_after_url) {
            const { data: sd } = await supabase.storage
              .from('delivery-photos')
              .createSignedUrl(order.photo_after_url, 3600);
            if (sd) entry.after = sd.signedUrl;
          }
          urls[order.id] = entry;
        })
      );
      setPhotoUrls(urls);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  useEffect(() => {
    const codeOrderIds = orders
      .filter((order) => isOrderActive(order.status) && order.status !== 'en_attente')
      .map((order) => order.id);

    if (codeOrderIds.length === 0) return;

    Promise.all(codeOrderIds.map((id) => getSecretCode(id))).then((codes) => {
      setSecretCodes(Object.fromEntries(codeOrderIds.map((id, index) => [id, codes[index]])));
    });
  }, [orders]);

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

  const activeOrders = orders.filter((order) => isOrderActive(order.status));
  const pastOrders = orders.filter((order) => !isOrderActive(order.status));

  if (orders.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Aucune livraison en cours</Text>
          <Text style={styles.emptySubtitle}>Envoyez votre premier colis !</Text>
          <Button title="Envoyer un colis" onPress={() => router.push('/new-order')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Suivi" />

        {activeOrders.map((order) => (
          <ActiveOrderCard
            key={order.id}
            order={order}
            secretCode={secretCodes[order.id] ?? null}
            photoUrls={photoUrls[order.id]}
          />
        ))}

        {pastOrders.length > 0 && (
          <View>
            <SectionTitle title="Historique" />
            <View style={styles.historyList}>
              {pastOrders.map((order) => (
                <HistoryRow
                  key={order.id}
                  order={order}
                  photoUrls={photoUrls[order.id]}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Visionneur plein écran minimaliste ──────────────────────────────────────

function PhotoViewer({
  uri,
  visible,
  onClose,
}: {
  uri: string;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBg} onPress={onClose}>
        <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
      </Pressable>
    </Modal>
  );
}

// ─── Section preuves partagée ─────────────────────────────────────────────────

function ProofSection({ photoUrls }: { photoUrls?: PhotoUrls }) {
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const hasPhotos = !!(photoUrls?.before || photoUrls?.after);

  return (
    <>
      <View style={styles.proofSection}>
        <Text style={styles.proofTitle}>Preuves photographiques</Text>
        {hasPhotos ? (
          <View style={styles.proofRow}>
            {photoUrls?.before && (
              <Pressable
                style={styles.proofThumbWrap}
                onPress={() => setViewerUri(photoUrls.before!)}
              >
                <Image source={{ uri: photoUrls.before }} style={styles.proofThumb} />
                <Text style={styles.proofLabel}>Avant transport</Text>
              </Pressable>
            )}
            {photoUrls?.after && (
              <Pressable
                style={styles.proofThumbWrap}
                onPress={() => setViewerUri(photoUrls.after!)}
              >
                <Image source={{ uri: photoUrls.after }} style={styles.proofThumb} />
                <Text style={styles.proofLabel}>À la remise</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.proofHint}>Photos disponibles après la livraison.</Text>
        )}
      </View>

      {viewerUri && (
        <PhotoViewer
          uri={viewerUri}
          visible={!!viewerUri}
          onClose={() => setViewerUri(null)}
        />
      )}
    </>
  );
}

// ─── Carte commande active ────────────────────────────────────────────────────

function ActiveOrderCard({
  order,
  secretCode,
  photoUrls,
}: {
  order: Order;
  secretCode: string | null;
  photoUrls?: PhotoUrls;
}) {
  const status = getOrderStatusInfo(order.status);
  const steps = getTrackingSteps(order.status);
  const showMap = GPS_VISIBLE_STATUSES.includes(order.status);

  const { driverPosition } = useRealtimePosition({ orderId: order.id });

  useDeliveryVoiceAlerts(order.status, order.eta_minutes);

  return (
    <Card style={styles.activeCard}>
      {showMap ? (
        driverPosition ? (
          <DeliveryMap
            mode="client"
            driverPosition={driverPosition}
            eta={order.eta_minutes}
            lastUpdatedAt={driverPosition.updatedAt}
          />
        ) : (
          <View style={styles.mapWaiting}>
            <MapPin size={20} color={colors.muted} />
            <Text style={styles.mapWaitingText}>En attente de la position du livreur…</Text>
          </View>
        )
      ) : null}

      <View style={styles.activeHeader}>
        <Text style={styles.activeId}>{formatOrderId(order.id)}</Text>
        <Pill label={status.label} tone={status.tone} />
      </View>

      <View style={styles.checklist}>
        {steps.map((step) => (
          <View key={step.key} style={styles.checklistRow}>
            {step.done ? (
              <CheckCircle2 size={18} color={colors.green} />
            ) : (
              <Circle size={18} color={colors.line} />
            )}
            <Text style={[styles.checklistLabel, step.done && styles.checklistLabelDone]}>
              {step.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.secretBlock}>
        <View style={styles.secretHeader}>
          <KeyRound size={18} color={colors.navy} />
          <Text style={styles.secretTitle}>Code de validation</Text>
        </View>
        {order.status === 'en_attente' ? (
          <>
            <Text style={[styles.secretCode, styles.secretCodePlaceholder]}>— — —</Text>
            <Text style={styles.secretHint}>{"Disponible dès qu'un livreur est assigné."}</Text>
          </>
        ) : secretCode ? (
          <>
            <Text style={styles.secretCode}>{secretCode.split('').join(' ')}</Text>
            <Text style={styles.secretHint}>
              Communique ce code au livreur uniquement à la remise du colis.
            </Text>
          </>
        ) : (
          <Text style={styles.secretHint}>
            {"Code non disponible sur cet appareil. Retrouve-le sur l'appareil utilisé pour créer la commande."}
          </Text>
        )}
      </View>

      <View style={styles.proofDivider} />
      <ProofSection photoUrls={photoUrls} />
    </Card>
  );
}

// ─── Ligne historique ─────────────────────────────────────────────────────────

function HistoryRow({ order, photoUrls }: { order: Order; photoUrls?: PhotoUrls }) {
  const status      = getOrderStatusInfo(order.status);
  const hasPhotos   = !!(photoUrls?.before || photoUrls?.after);
  const isDelivered = order.status === 'livree';

  const [cert, setCert]           = useState<Certificate | null>(null);
  const [certChecked, setCertChecked] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const stoppedRef = useRef(false);

  // Poll la table certificates toutes les 5s jusqu'à ce que le certificat existe.
  useEffect(() => {
    if (!isDelivered) return;
    stoppedRef.current = false;

    async function check() {
      const found = await getCertificate(order.id);
      if (stoppedRef.current) return;
      setCertChecked(true);
      if (found) {
        setCert(found);
        stoppedRef.current = true;
      }
    }

    check();
    const id = setInterval(() => { if (!stoppedRef.current) check(); }, 5000);
    return () => { stoppedRef.current = true; clearInterval(id); };
  }, [isDelivered, order.id]);

  async function handleDownload() {
    if (!cert) return;
    setDownloading(true);
    try {
      await downloadCertificate(cert.id, cert.pdf_path);
    } catch (e) {
      Alert.alert('Certificat', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setDownloading(false);
    }
  }

  function showDetail() {
    if (!hasPhotos) {
      Alert.alert(
        formatOrderId(order.id),
        `Vers : ${order.dropoff.name}\n${order.dropoff.address}\nPrix : ${formatPrice(order.price_fcfa)}\n${status.label} le ${formatDate(order.created_at)}`
      );
    }
  }

  return (
    <View style={styles.historyItem}>
      <Pressable onPress={showDetail}>
        <Card style={styles.historyRow}>
          <View style={styles.historyTexts}>
            <Text style={styles.historyId}>{formatOrderId(order.id)}</Text>
            <Text style={styles.historyDate}>{formatDate(order.created_at)}</Text>
          </View>
          <View style={styles.historyRight}>
            <Text style={styles.historyPrice}>{formatPrice(order.price_fcfa)}</Text>
            <Pill label={status.label} tone={status.tone} />
          </View>
        </Card>
      </Pressable>

      {hasPhotos && (
        <Card style={styles.historyProofCard}>
          <ProofSection photoUrls={photoUrls} />
        </Card>
      )}

      {isDelivered && certChecked && !cert && (
        <View style={styles.certPending}>
          <Clock size={14} color={colors.muted} />
          <Text style={styles.certPendingText}>Certificat numérique en préparation…</Text>
        </View>
      )}

      {isDelivered && cert && (
        <Pressable
          onPress={handleDownload}
          disabled={downloading}
          style={({ pressed }) => [styles.certButton, pressed && styles.certButtonPressed]}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <FileDown size={16} color={colors.green} />
          )}
          <Text style={styles.certButtonText}>
            {downloading ? 'Téléchargement…' : 'Certificat prêt · Télécharger'}
          </Text>
        </Pressable>
      )}
    </View>
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  activeCard: {
    gap: spacing.md,
  },
  mapWaiting: {
    height: 80,
    borderRadius: radius.md,
    backgroundColor: '#D7DEEA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mapWaitingText: {
    fontSize: 13,
    color: colors.muted,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeId: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  checklist: {
    gap: spacing.sm,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  checklistLabelDone: {
    color: colors.ink,
    fontWeight: '600',
  },
  secretBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  secretHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  secretTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  secretCode: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.navy,
  },
  secretCodePlaceholder: {
    color: colors.line,
  },
  secretHint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  proofDivider: {
    height: 1,
    backgroundColor: colors.line,
  },
  proofSection: {
    gap: spacing.sm,
  },
  proofTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  proofRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  proofThumbWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  proofThumb: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
  },
  proofLabel: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  proofHint: {
    fontSize: 12,
    color: colors.muted,
  },
  historyList: {
    gap: spacing.sm,
  },
  historyItem: {
    gap: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTexts: {
    gap: 2,
  },
  historyId: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  historyDate: {
    fontSize: 12,
    color: colors.muted,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  historyPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  historyProofCard: {
    marginTop: -radius.sm,
    paddingTop: spacing.md + radius.sm,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  certPending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  certPendingText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  certButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  certButtonPressed: {
    opacity: 0.7,
  },
  certButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.green,
  },
  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
});
