import { useFocusEffect } from '@react-navigation/native';
import { Bike, ShieldCheck, ShieldOff, Star, UserPlus } from 'lucide-react-native';
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
import { TextField } from '@/src/components/TextField';
import {
  createDriver,
  deleteAccount,
  listDrivers,
  toggleDriverSuspension,
  type DriverRow,
} from '@/src/lib/admin';
import { DRIVER_STATUS_INFO } from '@/src/lib/driverActions';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

function getInitials(name: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const EMPTY_FORM = { full_name: '', email: '', phone: '', moto_plate: '', password: '' };

export default function AdminDriversScreen() {
  const [drivers, setDrivers]       = useState<DriverRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formError, setFormError]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await listDrivers();
    setDrivers(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function setField(field: keyof typeof EMPTY_FORM) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    const { full_name, email, phone, moto_plate, password } = form;
    if (!full_name.trim())  return setFormError('Le nom complet est requis.');
    if (!email.trim())      return setFormError('L\'e-mail est requis.');
    if (!moto_plate.trim()) return setFormError('La plaque moto est requise.');
    if (password.length < 8) return setFormError('Le mot de passe doit faire au moins 8 caractères.');

    setFormError(null);
    setSubmitting(true);
    const err = await createDriver({ full_name, email, phone, moto_plate, password });
    setSubmitting(false);

    if (err) {
      setFormError(err);
      return;
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function handleToggleSuspend(driver: DriverRow) {
    const suspend = driver.status !== 'suspendu';
    setTogglingId(driver.id);
    await toggleDriverSuspension(driver.id, suspend);
    setTogglingId(null);
    load();
  }

  function handleDeleteDriver(driver: DriverRow) {
    Alert.alert(
      'Supprimer ce livreur',
      `Supprimer définitivement le compte de ${driver.full_name ?? 'ce livreur'} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(driver.profile_id);
            const err = await deleteAccount(driver.profile_id);
            setDeletingId(null);
            if (err) {
              Alert.alert('Erreur', err);
            } else {
              load();
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Livreurs internes" />

        <Button
          title={showForm ? 'Annuler' : 'Inscrire un livreur'}
          variant={showForm ? 'ghost' : 'primary'}
          onPress={() => { setShowForm((v) => !v); setFormError(null); setForm(EMPTY_FORM); }}
        />

        {showForm && (
          <Card style={styles.formCard}>
            <View style={styles.formHeader}>
              <UserPlus size={18} color={colors.navy} />
              <Text style={styles.formTitle}>Nouveau livreur</Text>
            </View>
            <TextField
              label="Nom complet"
              placeholder="Prénom Nom"
              value={form.full_name}
              onChangeText={setField('full_name')}
            />
            <TextField
              label="E-mail"
              placeholder="livreur@example.com"
              value={form.email}
              onChangeText={setField('email')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextField
              label="Téléphone (optionnel)"
              placeholder="+221 77 000 00 00"
              value={form.phone}
              onChangeText={setField('phone')}
              keyboardType="phone-pad"
            />
            <TextField
              label="Plaque moto"
              placeholder="AA-000-XX"
              value={form.moto_plate}
              onChangeText={setField('moto_plate')}
              autoCapitalize="characters"
            />
            <TextField
              label="Mot de passe initial"
              placeholder="8 caractères minimum"
              value={form.password}
              onChangeText={setField('password')}
              secureTextEntry
            />
            {formError && <Text style={styles.formError}>{formError}</Text>}
            <Button title="Inscrire" onPress={handleCreate} loading={submitting} />
          </Card>
        )}

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Réessayer" variant="ghost" onPress={load} />
          </View>
        ) : drivers.length === 0 ? (
          <View style={styles.centered}>
            <Bike size={36} color={colors.muted} />
            <Text style={styles.emptyText}>Aucun livreur inscrit.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {drivers.map((driver) => {
              const statusInfo = DRIVER_STATUS_INFO[driver.status];
              const isSuspended = driver.status === 'suspendu';
              const isToggling  = togglingId === driver.id;
              return (
                <Card key={driver.id} style={styles.driverCard}>
                  <View style={styles.driverTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(driver.full_name)}</Text>
                    </View>
                    <View style={styles.driverInfo}>
                      <Text style={styles.driverName}>{driver.full_name ?? 'Livreur'}</Text>
                      <Text style={styles.driverSub}>
                        {driver.moto_plate ?? '—'} · {driver.phone ?? '—'}
                      </Text>
                    </View>
                    <Pill label={statusInfo.label} tone={statusInfo.tone} />
                  </View>

                  <View style={styles.driverStats}>
                    <View style={styles.statItem}>
                      <Star size={14} color={driver.trust_score < 70 ? '#D14343' : colors.gold} />
                      <Text style={[styles.statValue, driver.trust_score < 70 && styles.statDanger]}>
                        {driver.trust_score}
                      </Text>
                      <Text style={styles.statLabel}>score</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Bike size={14} color={colors.muted} />
                      <Text style={styles.statValue}>{driver.order_count}</Text>
                      <Text style={styles.statLabel}>livraisons</Text>
                    </View>
                    {driver.is_verified ? (
                      <ShieldCheck size={16} color={colors.green} />
                    ) : (
                      <ShieldOff size={16} color={colors.muted} />
                    )}
                  </View>

                  <View style={styles.driverActions}>
                    <ActionButton
                      title={isSuspended ? 'Réactiver' : 'Suspendre'}
                      onPress={() => handleToggleSuspend(driver)}
                      loading={isToggling}
                      color={colors.green}
                    />
                    <ActionButton
                      title="Supprimer"
                      onPress={() => handleDeleteDriver(driver)}
                      loading={deletingId === driver.profile_id}
                      color="#D14343"
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({ title, onPress, loading, color }: { title: string; onPress: () => void; loading: boolean; color: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionBtn, { borderColor: color }, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Text style={[styles.actionBtnText, { color }]}>{title}</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: colors.bg },
  content:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered:    { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  errorText:   { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyText:   { fontSize: 14, color: colors.muted, textAlign: 'center' },
  formCard:    { gap: spacing.md },
  formHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formTitle:   { fontSize: 15, fontWeight: '700', color: colors.ink },
  formError:   { fontSize: 12, color: '#D14343' },
  list:        { gap: spacing.sm },
  driverCard:  { gap: spacing.md },
  driverTop:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar:      { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '800', color: colors.green },
  driverInfo:  { flex: 1, gap: 2 },
  driverName:  { fontSize: 14, fontWeight: '700', color: colors.ink },
  driverSub:   { fontSize: 12, color: colors.muted },
  driverStats:   { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  statItem:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statValue:     { fontSize: 14, fontWeight: '700', color: colors.ink },
  statDanger:    { color: '#D14343' },
  statLabel:     { fontSize: 11, color: colors.muted },
  driverActions: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
});
