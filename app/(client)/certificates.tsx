import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { ArrowLeft, Download, FileText, Share2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Pill } from '@/src/components/Pill';
import { downloadCertificate } from '@/src/lib/certificate';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Certificate } from '@/src/types';

type CertWithOrder = Certificate & {
  orders: {
    id: string;
    pickup: { address: string };
    dropoff: { address: string; name: string };
    created_at: string;
  };
};

function formatRef(orderId: string): string {
  return `SLV-${orderId.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-6)}`;
}

export default function ClientCertificatesScreen() {
  const [certs, setCerts] = useState<CertWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CertWithOrder | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from('certificates')
      .select('id, order_id, pdf_path, doc_hash, created_at, orders(id, pickup, dropoff, created_at)')
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError('Impossible de charger tes certificats. Vérifie ta connexion et réessaie.');
      setLoading(false);
      return;
    }

    setCerts((data ?? []) as unknown as CertWithOrder[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleDownload(cert: CertWithOrder) {
    setDownloading(true);
    try {
      await downloadCertificate(cert.id, cert.pdf_path);
    } catch (e) {
      Alert.alert('Certificat', e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Mes certificats</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Réessayer" variant="ghost" onPress={load} />
        </View>
      ) : certs.length === 0 ? (
        <View style={styles.centered}>
          <FileText size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Aucun certificat</Text>
          <Text style={styles.emptySubtitle}>
            Tes certificats de livraison apparaîtront ici une fois les livraisons validées.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {certs.map((cert) => (
            <Pressable
              key={cert.id}
              onPress={() => setSelected(cert)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.iconWrap}>
                <FileText size={20} color={colors.green} />
              </View>
              <View style={styles.rowTexts}>
                <Text style={styles.rowRef}>{formatRef(cert.orders.id)}</Text>
                <Text style={styles.rowRoute} numberOfLines={1}>
                  {cert.orders.pickup.address} → {cert.orders.dropoff.address}
                </Text>
                <Text style={styles.rowDate}>{formatDate(cert.orders.created_at)}</Text>
              </View>
              <Pill label="Prêt" tone="green" />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Modal détail */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {/* Carte navy */}
            <View style={styles.certCard}>
              <Text style={styles.certLabel}>Certificat de livraison</Text>
              <Text style={styles.certRef}>
                {selected ? formatRef(selected.orders.id) : ''}
              </Text>
              <View style={styles.certVerified}>
                <View style={styles.certDot} />
                <Text style={styles.certVerifiedText}>Livraison vérifiée</Text>
              </View>

              <View style={styles.certDivider} />

              <View style={styles.certMeta}>
                <Text style={styles.certMetaLabel}>ENLÈVEMENT</Text>
                <Text style={styles.certMetaValue} numberOfLines={2}>
                  {selected?.orders.pickup.address}
                </Text>
              </View>
              <View style={styles.certMeta}>
                <Text style={styles.certMetaLabel}>DESTINATAIRE</Text>
                <Text style={styles.certMetaValue}>
                  {selected?.orders.dropoff.name}
                </Text>
                <Text style={styles.certMetaValue} numberOfLines={2}>
                  {selected?.orders.dropoff.address}
                </Text>
              </View>
              <View style={styles.certMeta}>
                <Text style={styles.certMetaLabel}>DATE</Text>
                <Text style={styles.certMetaValue}>
                  {selected ? formatDate(selected.orders.created_at) : ''}
                </Text>
              </View>
              <View style={styles.certMeta}>
                <Text style={styles.certMetaLabel}>EMPREINTE SHA-256</Text>
                <Text style={[styles.certMetaValue, styles.certHash]}>
                  {selected ? formatHash(selected.doc_hash) : ''}
                </Text>
              </View>
            </View>

            {/* Boutons */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary, downloading && styles.actionBtnDisabled]}
                onPress={() => selected && handleDownload(selected)}
                disabled={downloading}
              >
                {downloading
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Download size={16} color={colors.white} />
                }
                <Text style={styles.actionBtnTextPrimary}>
                  {downloading ? 'Téléchargement…' : 'Télécharger le PDF'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.actionBtn, styles.actionBtnGhost, downloading && styles.actionBtnDisabled]}
                onPress={() => selected && handleDownload(selected)}
                disabled={downloading}
              >
                <Share2 size={16} color={colors.navy} />
                <Text style={styles.actionBtnTextGhost}>Partager</Text>
              </Pressable>

              <Pressable onPress={() => setSelected(null)} style={styles.closeLink}>
                <Text style={styles.closeLinkText}>Fermer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink },
  headerSpacer: { width: 30 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptySubtitle: { fontSize: 13, color: colors.muted, textAlign: 'center' },

  list: { padding: spacing.lg, gap: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowPressed: { opacity: 0.75 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: { flex: 1, gap: 2 },
  rowRef: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowRoute: { fontSize: 12, color: colors.muted },
  rowDate: { fontSize: 11, color: colors.muted },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Carte navy
  certCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  certLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1 },
  certRef: { fontSize: 26, fontWeight: '800', color: colors.white },
  certVerified: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  certDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  certVerifiedText: { fontSize: 13, fontWeight: '600', color: colors.green },

  certDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: spacing.xs },

  certMeta: { gap: 2 },
  certMetaLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.8 },
  certMetaValue: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },
  certHash: { fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // Boutons modal
  modalActions: { gap: spacing.sm },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  actionBtnPrimary: { backgroundColor: colors.green },
  actionBtnGhost: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.navy },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnTextPrimary: { fontSize: 15, fontWeight: '700', color: colors.white },
  actionBtnTextGhost: { fontSize: 15, fontWeight: '700', color: colors.navy },

  closeLink: { alignItems: 'center', paddingVertical: spacing.sm },
  closeLinkText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
});
