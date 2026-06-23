import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, Bot, ShieldAlert, TrendingDown } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
  listIncidents,
  listMonitoringEvents,
  updateIncidentStatus,
  type IncidentRow,
  type MonitoringEventRow,
} from '@/src/lib/admin';
import {
  getNextIncidentStatus,
  INCIDENT_STATUS_INFO,
  INCIDENT_TYPE_LABELS,
} from '@/src/lib/incidentStatus';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { AnomalySeverity, AnomalyType, IncidentStatus } from '@/src/types';

// ─── Labels monitoring ────────────────────────────────────────────────────────

const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  detour:          'Détour suspect',
  arret_prolonge:  'Arrêt prolongé',
  coupure_gps:     'Coupure GPS',
  echec_code:      'Échec code validation',
};

const ANOMALY_SEVERITY_TONE: Record<AnomalySeverity, 'amber' | 'red'> = {
  faible:  'amber',
  elevee:  'red',
};

const ANOMALY_SEVERITY_LABEL: Record<AnomalySeverity, string> = {
  faible:  'Faible',
  elevee:  'Élevée',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOrderId(id: string | null) {
  if (!id) return '—';
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const NEXT_STATUS_LABEL: Partial<Record<IncidentStatus, string>> = {
  ouvert:   'Marquer en cours',
  en_cours: 'Marquer résolu',
};

type Tab = 'incidents' | 'monitoring';

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AdminIncidentsScreen() {
  const [tab, setTab]                 = useState<Tab>('incidents');
  const [incidents, setIncidents]     = useState<IncidentRow[]>([]);
  const [events, setEvents]           = useState<MonitoringEventRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [inc, ev] = await Promise.all([listIncidents(), listMonitoringEvents()]);
    setIncidents(inc);
    setEvents(ev);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdvanceStatus(incident: IncidentRow) {
    const next = getNextIncidentStatus(incident.status);
    if (!next) return;
    setUpdatingId(incident.id);
    await updateIncidentStatus(incident.id, next);
    setUpdatingId(null);
    load();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Sécurité" />

        {/* Segment control */}
        <View style={styles.segment}>
          <Pressable
            style={[styles.segBtn, tab === 'incidents' && styles.segBtnActive]}
            onPress={() => setTab('incidents')}
          >
            <AlertTriangle size={14} color={tab === 'incidents' ? colors.white : colors.muted} />
            <Text style={[styles.segText, tab === 'incidents' && styles.segTextActive]}>
              Incidents
            </Text>
            {incidents.length > 0 && (
              <View style={[styles.segBadge, tab === 'incidents' && styles.segBadgeActive]}>
                <Text style={[styles.segBadgeText, tab === 'incidents' && styles.segBadgeTextActive]}>
                  {incidents.filter(i => i.status !== 'resolu').length}
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.segBtn, tab === 'monitoring' && styles.segBtnActive]}
            onPress={() => setTab('monitoring')}
          >
            <Bot size={14} color={tab === 'monitoring' ? colors.white : colors.muted} />
            <Text style={[styles.segText, tab === 'monitoring' && styles.segTextActive]}>
              Surveillance IA
            </Text>
            {events.length > 0 && (
              <View style={[styles.segBadge, tab === 'monitoring' && styles.segBadgeActive]}>
                <Text style={[styles.segBadgeText, tab === 'monitoring' && styles.segBadgeTextActive]}>
                  {events.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Réessayer" variant="ghost" onPress={load} />
          </View>
        ) : tab === 'incidents' ? (
          <IncidentsList
            incidents={incidents}
            updatingId={updatingId}
            onAdvance={handleAdvanceStatus}
          />
        ) : (
          <MonitoringList events={events} />
        )}

        <Text style={styles.footNote}>
          {tab === 'incidents'
            ? 'Tout incident est traité par la cellule interne sous 24h.'
            : 'Événements détectés automatiquement par le moteur de surveillance GPS.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Liste incidents ──────────────────────────────────────────────────────────

function IncidentsList({
  incidents,
  updatingId,
  onAdvance,
}: {
  incidents: IncidentRow[];
  updatingId: string | null;
  onAdvance: (i: IncidentRow) => void;
}) {
  if (incidents.length === 0) {
    return (
      <View style={styles.centered}>
        <ShieldAlert size={36} color={colors.muted} />
        <Text style={styles.emptyText}>Aucun incident signalé.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {incidents.map((incident) => {
        const statusInfo = INCIDENT_STATUS_INFO[incident.status];
        const nextLabel  = NEXT_STATUS_LABEL[incident.status];
        const isUpdating = updatingId === incident.id;
        return (
          <Card key={incident.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {INCIDENT_TYPE_LABELS[incident.type as keyof typeof INCIDENT_TYPE_LABELS] ?? incident.type}
              </Text>
              <Pill label={statusInfo.label} tone={statusInfo.tone} />
            </View>

            {incident.description && (
              <Text style={styles.cardDesc}>{incident.description}</Text>
            )}

            <View style={styles.cardMeta}>
              <Text style={styles.metaItem}>Commande : {formatOrderId(incident.order_id)}</Text>
              {incident.driver_name && (
                <Text style={styles.metaItem}>Livreur : {incident.driver_name}</Text>
              )}
              <Text style={styles.metaDate}>{formatDate(incident.created_at)}</Text>
            </View>

            {nextLabel && (
              <Button
                title={nextLabel}
                variant="ghost"
                onPress={() => onAdvance(incident)}
                loading={isUpdating}
              />
            )}
          </Card>
        );
      })}
    </View>
  );
}

// ─── Liste événements monitoring ──────────────────────────────────────────────

function MonitoringList({ events }: { events: MonitoringEventRow[] }) {
  if (events.length === 0) {
    return (
      <View style={styles.centered}>
        <Bot size={36} color={colors.muted} />
        <Text style={styles.emptyText}>Aucune anomalie détectée.</Text>
      </View>
    );
  }

  // Regrouper par order_id pour afficher les anomalies par livraison.
  const byOrder = events.reduce<Record<string, MonitoringEventRow[]>>((acc, ev) => {
    const key = ev.order_id ?? '_no_order';
    (acc[key] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <View style={styles.list}>
      {Object.entries(byOrder).map(([orderId, evs]) => {
        const totalPenalty = evs.reduce((s, e) => s + e.penalty, 0);
        const hasHigh = evs.some(e => e.severity === 'elevee');
        const driverName = evs[0]?.driver_name;

        return (
          <Card key={orderId} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <TrendingDown size={16} color={hasHigh ? '#D14343' : colors.gold} />
                <Text style={styles.cardTitle}>{formatOrderId(orderId === '_no_order' ? null : orderId)}</Text>
              </View>
              <View style={styles.penaltyBadge}>
                <Text style={styles.penaltyText}>−{totalPenalty} pts</Text>
              </View>
            </View>

            {driverName && (
              <Text style={styles.metaItem}>Livreur : {driverName}</Text>
            )}

            <View style={styles.evList}>
              {evs.map((ev) => (
                <View key={ev.id} style={styles.evRow}>
                  <Pill
                    label={ANOMALY_SEVERITY_LABEL[ev.severity]}
                    tone={ANOMALY_SEVERITY_TONE[ev.severity]}
                  />
                  <View style={styles.evTexts}>
                    <Text style={styles.evType}>{ANOMALY_TYPE_LABELS[ev.type]}</Text>
                    {ev.detail && (
                      <Text style={styles.evDetail} numberOfLines={2}>{ev.detail}</Text>
                    )}
                    <Text style={styles.metaDate}>{formatDate(ev.created_at)}</Text>
                  </View>
                  <Text style={styles.evPenalty}>−{ev.penalty}</Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  errorText:{ fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyText:{ fontSize: 14, color: colors.muted, textAlign: 'center' },
  list:     { gap: spacing.sm },
  footNote: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.xl },

  // Segment control
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.line,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segBtnActive: { backgroundColor: colors.navy },
  segText:      { fontSize: 13, fontWeight: '600', color: colors.muted },
  segTextActive:{ color: colors.white },
  segBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segBadgeActive:       { backgroundColor: 'rgba(255,255,255,0.2)' },
  segBadgeText:         { fontSize: 10, fontWeight: '800', color: colors.muted },
  segBadgeTextActive:   { color: colors.white },

  // Cards
  card:      { gap: spacing.md },
  cardHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardDesc:  { fontSize: 13, color: colors.muted },
  cardMeta:  { gap: 2 },
  metaItem:  { fontSize: 12, fontWeight: '600', color: colors.navy },
  metaDate:  { fontSize: 11, color: colors.muted },

  // Penalty badge
  penaltyBadge: {
    backgroundColor: '#FBE7E7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  penaltyText: { fontSize: 12, fontWeight: '800', color: '#D14343' },

  // Events list
  evList: { gap: spacing.sm },
  evRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  evTexts:  { flex: 1, gap: 2 },
  evType:   { fontSize: 13, fontWeight: '600', color: colors.ink },
  evDetail: { fontSize: 12, color: colors.muted },
  evPenalty:{ fontSize: 12, fontWeight: '700', color: '#D14343', minWidth: 28, textAlign: 'right' },
});
