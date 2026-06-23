/**
 * Monitoring IA — espace admin uniquement.
 * Les données de cette table (monitoring_events) ne sont jamais exposées
 * aux rôles client/livreur : la RLS policy "admin_lit_monitoring" l'interdit
 * côté serveur, et cet écran n'est accessible que derrière le RoleGate admin.
 */
import { useFocusEffect } from '@react-navigation/native';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Navigation2,
  Pencil,
  RefreshCcw,
  ShieldOff,
  TrendingDown,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Pill } from '@/src/components/Pill';
import { SectionTitle } from '@/src/components/SectionTitle';
import {
  getMonitoringConfig,
  getMonitoringStats,
  listDriverScores,
  listMonitoringEvents,
  reactivateDriver,
  toggleMonitoringRule,
  updateMonitoringConfig,
  type DriverScoreRow,
  type MonitoringConfigRow,
  type MonitoringEventRow,
  type MonitoringStats,
} from '@/src/lib/admin';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { AnomalyType, DriverStatus } from '@/src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1)  return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function orderId(id: string | null) {
  return id ? `#${id.slice(0, 8).toUpperCase()}` : '—';
}

function getInitials(name: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function scoreColor(score: number) {
  if (score >= 80) return colors.green;
  if (score >= 60) return '#E8A000';
  return '#D14343';
}

const ANOMALY_META: Record<AnomalyType, { label: string; Icon: typeof WifiOff }> = {
  detour:         { label: 'Détour suspect',    Icon: Navigation2  },
  arret_prolonge: { label: 'Arrêt prolongé',    Icon: Clock        },
  coupure_gps:    { label: 'Coupure GPS',       Icon: WifiOff      },
  echec_code:     { label: 'Échec code valida.', Icon: ShieldOff   },
};

const DRIVER_STATUS_INFO: Record<DriverStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'navy' }> = {
  disponible:  { label: 'Disponible',    tone: 'green' },
  en_course:   { label: 'En course',     tone: 'navy'  },
  suspendu:    { label: 'Suspendu auto', tone: 'red'   },
  hors_ligne:  { label: 'Hors ligne',    tone: 'gray'  },
};

const CONFIG_META: Record<string, { label: string; unit: string; desc: string }> = {
  detour_km:        { label: 'Détour suspect',    unit: 'km',  desc: 'Écart max tolérée au-delà du trajet direct × 1.4' },
  arret_minutes:    { label: 'Arrêt prolongé',    unit: 'min', desc: 'Immobilité sans mouvement (< 50 m) avant alerte'  },
  coupure_minutes:  { label: 'Coupure GPS',       unit: 'min', desc: 'Silence GPS avant alerte sévère + incident auto'  },
  seuil_suspension: { label: 'Seuil suspension',  unit: 'pts', desc: 'Score en dessous duquel le livreur est suspendu'  },
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function AdminMonitoringScreen() {
  const [stats,        setStats]        = useState<MonitoringStats | null>(null);
  const [events,       setEvents]       = useState<MonitoringEventRow[]>([]);
  const [drivers,      setDrivers]      = useState<DriverScoreRow[]>([]);
  const [config,       setConfig]       = useState<MonitoringConfigRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const [savingCfg,    setSavingCfg]    = useState<string | null>(null);
  const [editingKey,   setEditingKey]   = useState<string | null>(null);
  const [editValue,    setEditValue]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [s, ev, dr, cfg] = await Promise.all([
      getMonitoringStats(),
      listMonitoringEvents(20),
      listDriverScores(),
      getMonitoringConfig(),
    ]);

    setStats(s);
    setEvents(ev);
    setDrivers(dr);
    setConfig(cfg);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Réactivation livreur ──────────────────────────────────────────────────

  function handleReactivate(driver: DriverScoreRow) {
    Alert.alert(
      'Réactiver le livreur',
      `Confirmes-tu la réactivation de ${driver.full_name ?? 'ce livreur'} après enquête ?\n\nIl passera en "Hors ligne" et devra se reconnecter manuellement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: `Score inchangé (${driver.trust_score} pts)`,
          onPress: () => doReactivate(driver.id, false),
        },
        {
          text: 'Score remis à 70 pts',
          onPress: () => doReactivate(driver.id, true),
        },
      ],
    );
  }

  async function doReactivate(driverId: string, resetScore: boolean) {
    setReactivating(driverId);
    const err = await reactivateDriver(driverId, resetScore);
    setReactivating(null);
    if (err) Alert.alert('Erreur', err);
    else load();
  }

  // ── Édition config ────────────────────────────────────────────────────────

  function startEdit(row: MonitoringConfigRow) {
    setEditingKey(row.key);
    setEditValue(String(row.value));
  }

  async function commitEdit() {
    if (!editingKey) return;
    const v = parseFloat(editValue);
    if (isNaN(v) || v <= 0) {
      Alert.alert('Valeur invalide', 'Entre un nombre positif.');
      return;
    }
    setSavingCfg(editingKey);
    setEditingKey(null);
    const err = await updateMonitoringConfig(editingKey, v);
    setSavingCfg(null);
    if (err) Alert.alert('Erreur', err);
    else load();
  }

  async function handleToggle(row: MonitoringConfigRow) {
    setSavingCfg(row.key);
    const err = await toggleMonitoringRule(row.key, !row.enabled);
    setSavingCfg(null);
    if (err) Alert.alert('Erreur', err);
    else load();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!loading && error) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Réessayer" variant="ghost" onPress={load} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />}
      >
        <View style={styles.titleRow}>
          <SectionTitle title="Monitoring IA" />
          {!loading && (
            <Pressable onPress={load} style={styles.refreshBtn} hitSlop={8}>
              <RefreshCcw size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* ── A. Stats 2×2 ───────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Trajets surveillés"
            value={stats?.activeTrips ?? 0}
            Icon={Activity}
            accent={colors.navy}
            loading={loading}
          />
          <StatCard
            label="Anomalies"
            sub="aujourd'hui"
            value={stats?.anomaliesToday ?? 0}
            Icon={AlertTriangle}
            accent={(stats?.anomaliesToday ?? 0) > 0 ? '#E8A000' : colors.green}
            loading={loading}
          />
          <StatCard
            label="Suspensions auto"
            sub="aujourd'hui"
            value={stats?.suspensionsToday ?? 0}
            Icon={ShieldOff}
            accent={(stats?.suspensionsToday ?? 0) > 0 ? '#D14343' : colors.green}
            loading={loading}
          />
          <StatCard
            label="Score moyen flotte"
            value={stats?.avgFleetScore ?? 0}
            valueSuffix=" pts"
            Icon={Gauge}
            accent={scoreColor(stats?.avgFleetScore ?? 100)}
            loading={loading}
          />
        </View>

        {/* ── B. Alertes récentes ─────────────────────────────────────────── */}
        <SectionTitle title="Alertes de surveillance" />
        <Card style={styles.alertsCard}>
          {loading && events.length === 0 ? (
            <View style={styles.cardLoading}><ActivityIndicator color={colors.green} /></View>
          ) : events.length === 0 ? (
            <View style={styles.emptyRow}>
              <CheckCircle2 size={24} color={colors.green} />
              <Text style={styles.emptyText}>Aucune anomalie détectée récemment.</Text>
            </View>
          ) : (
            events.map((ev, i) => (
              <AlertRow key={ev.id} event={ev} isLast={i === events.length - 1} />
            ))
          )}
        </Card>

        {/* ── C. Scores de fiabilité ──────────────────────────────────────── */}
        <SectionTitle title="Scores de fiabilité" />
        <Card style={styles.scoresCard}>
          {loading && drivers.length === 0 ? (
            <View style={styles.cardLoading}><ActivityIndicator color={colors.green} /></View>
          ) : drivers.length === 0 ? (
            <View style={styles.emptyRow}>
              <UserCheck size={24} color={colors.muted} />
              <Text style={styles.emptyText}>Aucun livreur enregistré.</Text>
            </View>
          ) : (
            drivers.map((dr, i) => (
              <DriverScoreRow
                key={dr.id}
                driver={dr}
                isLast={i === drivers.length - 1}
                reactivating={reactivating === dr.id}
                onReactivate={() => handleReactivate(dr)}
              />
            ))
          )}
        </Card>

        {/* ── D. Règles de détection ──────────────────────────────────────── */}
        <SectionTitle title="Règles de détection" />
        <Card style={styles.configCard}>
          {loading && config.length === 0 ? (
            <View style={styles.cardLoading}><ActivityIndicator color={colors.green} /></View>
          ) : (
            config.map((row, i) => (
              <ConfigRow
                key={row.key}
                row={row}
                isLast={i === config.length - 1}
                saving={savingCfg === row.key}
                editing={editingKey === row.key}
                editValue={editValue}
                onEditValue={setEditValue}
                onStartEdit={() => startEdit(row)}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingKey(null)}
                onToggle={() => handleToggle(row)}
              />
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, valueSuffix, Icon, accent, loading,
}: {
  label:        string;
  value:        number;
  sub?:         string;
  valueSuffix?: string;
  Icon:         typeof Activity;
  accent:       string;
  loading:      boolean;
}) {
  return (
    <Card style={[styles.statCard, { borderTopColor: accent }]}>
      <View style={[styles.statIconWrap, { backgroundColor: `${accent}18` }]}>
        <Icon size={18} color={accent} />
      </View>
      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: spacing.xs }} />
      ) : (
        <Text style={[styles.statValue, { color: accent }]}>
          {value}{valueSuffix ?? ''}
        </Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </Card>
  );
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ event, isLast }: { event: MonitoringEventRow; isLast: boolean }) {
  const meta = ANOMALY_META[event.type] ?? { label: event.type, Icon: AlertTriangle };
  const { Icon } = meta;
  const isHigh = event.severity === 'elevee';

  return (
    <View style={[styles.alertRow, !isLast && styles.rowBorder]}>
      <View style={[styles.alertIconWrap, { backgroundColor: isHigh ? '#FBE7E7' : '#FBF0DC' }]}>
        <Icon size={16} color={isHigh ? '#D14343' : '#A9710A'} />
      </View>

      <View style={styles.alertTexts}>
        <View style={styles.alertHeaderRow}>
          <Text style={styles.alertTitle}>{meta.label}</Text>
          <Pill label={isHigh ? 'Élevée' : 'Faible'} tone={isHigh ? 'red' : 'amber'} />
        </View>
        <Text style={styles.alertMeta}>
          {orderId(event.order_id)}{event.driver_name ? ` · ${event.driver_name}` : ''}
        </Text>
        {event.detail && (
          <Text style={styles.alertDetail} numberOfLines={2}>{event.detail}</Text>
        )}
        <View style={styles.alertFooter}>
          <Text style={styles.alertTime}>{relativeTime(event.created_at)}</Text>
          <Text style={styles.alertPenalty}>−{event.penalty} pts</Text>
        </View>
      </View>
    </View>
  );
}

// ─── DriverScoreRow ───────────────────────────────────────────────────────────

function DriverScoreRow({
  driver, isLast, reactivating, onReactivate,
}: {
  driver:      DriverScoreRow;
  isLast:      boolean;
  reactivating: boolean;
  onReactivate: () => void;
}) {
  const score   = driver.trust_score;
  const bar     = scoreColor(score);
  const info    = DRIVER_STATUS_INFO[driver.status] ?? { label: driver.status, tone: 'gray' as const };
  const isSusp  = driver.status === 'suspendu';

  return (
    <View style={[styles.scoreRow, !isLast && styles.rowBorder]}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: `${bar}22` }]}>
        <Text style={[styles.avatarText, { color: bar }]}>
          {getInitials(driver.full_name)}
        </Text>
      </View>

      {/* Infos + barre */}
      <View style={styles.scoreTexts}>
        <View style={styles.scoreNameRow}>
          <Text style={styles.scoreName}>{driver.full_name ?? 'Livreur'}</Text>
          <Pill label={info.label} tone={info.tone} />
        </View>

        {driver.anomaly_count_30d > 0 && (
          <Text style={styles.anomalyCount}>
            <TrendingDown size={11} color={colors.muted} /> {driver.anomaly_count_30d} anomalie{driver.anomaly_count_30d > 1 ? 's' : ''} (30j)
          </Text>
        )}

        {/* Barre de score */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${score}%`, backgroundColor: bar }]} />
        </View>
        <Text style={[styles.scoreValue, { color: bar }]}>{score} / 100</Text>
      </View>

      {/* Bouton réactivation */}
      {isSusp && (
        <Pressable
          style={({ pressed }) => [styles.reactBtn, pressed && styles.reactBtnPressed]}
          onPress={onReactivate}
          disabled={reactivating}
        >
          {reactivating
            ? <ActivityIndicator size="small" color={colors.green} />
            : <UserCheck size={16} color={colors.green} />
          }
        </Pressable>
      )}
    </View>
  );
}

// ─── ConfigRow ────────────────────────────────────────────────────────────────

function ConfigRow({
  row, isLast, saving, editing, editValue,
  onEditValue, onStartEdit, onCommitEdit, onCancelEdit, onToggle,
}: {
  row:          MonitoringConfigRow;
  isLast:       boolean;
  saving:       boolean;
  editing:      boolean;
  editValue:    string;
  onEditValue:  (v: string) => void;
  onStartEdit:  () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onToggle:     () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const meta = CONFIG_META[row.key] ?? { label: row.key, unit: '', desc: '' };

  return (
    <View style={[styles.configRow, !isLast && styles.rowBorder]}>
      {/* Toggle actif/inactif */}
      <Pressable
        style={[styles.toggle, row.enabled && styles.toggleOn]}
        onPress={onToggle}
        disabled={saving}
      >
        <View style={[styles.toggleThumb, row.enabled && styles.toggleThumbOn]} />
      </Pressable>

      {/* Libellé + description */}
      <View style={styles.configTexts}>
        <Text style={[styles.configLabel, !row.enabled && styles.configLabelOff]}>
          {meta.label}
        </Text>
        {meta.desc !== '' && (
          <Text style={styles.configDesc} numberOfLines={2}>{meta.desc}</Text>
        )}
      </View>

      {/* Valeur éditable */}
      {editing ? (
        <View style={styles.configEditRow}>
          <TextInput
            ref={inputRef}
            style={styles.configInput}
            value={editValue}
            onChangeText={onEditValue}
            keyboardType="numeric"
            autoFocus
            onSubmitEditing={onCommitEdit}
            returnKeyType="done"
          />
          <Text style={styles.configUnit}>{meta.unit}</Text>
          <Pressable onPress={onCommitEdit} style={styles.configActionBtn}>
            <CheckCircle2 size={18} color={colors.green} />
          </Pressable>
          <Pressable onPress={onCancelEdit} style={styles.configActionBtn}>
            <X size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : saving ? (
        <ActivityIndicator size="small" color={colors.green} style={{ marginLeft: spacing.sm }} />
      ) : (
        <Pressable onPress={onStartEdit} style={styles.configValueBtn}>
          <Text style={[styles.configValue, !row.enabled && styles.configValueOff]}>
            {row.value} {meta.unit}
          </Text>
          <Pencil size={12} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText:{ fontSize: 14, color: colors.muted, textAlign: 'center' },

  titleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: { padding: spacing.xs },

  // Stats grid 2×2
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48.5%',
    gap: spacing.xs,
    borderTopWidth: 3,
    padding: spacing.md,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  statLabel: { fontSize: 12, fontWeight: '600', color: colors.ink },
  statSub:   { fontSize: 10, color: colors.muted },

  // Alertes
  alertsCard: { gap: 0, padding: 0 },
  alertRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertTexts:    { flex: 1, gap: spacing.xs },
  alertHeaderRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  alertTitle:    { fontSize: 13, fontWeight: '700', color: colors.ink, flex: 1 },
  alertMeta:     { fontSize: 12, fontWeight: '600', color: colors.navy },
  alertDetail:   { fontSize: 11, color: colors.muted },
  alertFooter:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertTime:     { fontSize: 11, color: colors.muted },
  alertPenalty:  { fontSize: 12, fontWeight: '800', color: '#D14343' },

  // Scores
  scoresCard: { gap: 0, padding: 0 },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText:    { fontSize: 15, fontWeight: '800' },
  scoreTexts:    { flex: 1, gap: spacing.xs },
  scoreNameRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  scoreName:     { fontSize: 13, fontWeight: '700', color: colors.ink, flex: 1 },
  anomalyCount:  { fontSize: 11, color: colors.muted },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  barFill:       { height: 6, borderRadius: 3 },
  scoreValue:    { fontSize: 11, fontWeight: '700' },
  reactBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reactBtnPressed: { opacity: 0.7 },

  // Config
  configCard:  { gap: 0, padding: 0 },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  configTexts:    { flex: 1, gap: 2 },
  configLabel:    { fontSize: 13, fontWeight: '700', color: colors.ink },
  configLabelOff: { color: colors.muted },
  configDesc:     { fontSize: 11, color: colors.muted },
  configValueBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  configValue:    { fontSize: 14, fontWeight: '700', color: colors.navy },
  configValueOff: { color: colors.muted },
  configEditRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  configInput: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
    width: 56,
    textAlign: 'center',
  },
  configUnit:      { fontSize: 12, color: colors.muted },
  configActionBtn: { padding: spacing.xs },

  // Toggle
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.line,
    justifyContent: 'center',
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  toggleOn:       { backgroundColor: colors.green },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  toggleThumbOn:  { alignSelf: 'flex-end' },

  // Shared
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  cardLoading: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
