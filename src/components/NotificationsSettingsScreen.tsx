import { router } from 'expo-router';
import { ArrowLeft, Bell } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from './Card';
import { SectionTitle } from './SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { NotifPrefs } from '@/src/types';

type PrefKey = keyof NotifPrefs;

type PrefRow = {
  key: PrefKey;
  label: string;
  desc: string;
};

const DELIVERY_PREFS: PrefRow[] = [
  { key: 'delivery',   label: 'Statut de ma commande', desc: 'Livreur assigné, en route, arrivé, livré.' },
  { key: 'proximity',  label: 'Livreur à proximité',   desc: 'Alerte quand le livreur est en route vers vous.' },
  { key: 'certificate', label: 'Certificat prêt',       desc: 'Notification quand le certificat PDF est généré.' },
];

const OTHER_PREFS: PrefRow[] = [
  { key: 'promo', label: 'Offres & nouveautés', desc: 'Promotions et nouvelles fonctionnalités SECULIV.' },
];

export default function NotificationsSettingsScreen() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<NotifPrefs>(
    profile?.notif_prefs ?? { delivery: true, proximity: true, certificate: true, promo: false }
  );
  const [saving, setSaving] = useState<PrefKey | null>(null);

  async function handleToggle(key: PrefKey, value: boolean) {
    if (!profile) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // mise à jour optimiste
    setSaving(key);
    await supabase
      .from('profiles')
      .update({ notif_prefs: next })
      .eq('id', profile.id);
    setSaving(null);
  }

  function renderRow(row: PrefRow, isLast: boolean) {
    return (
      <View key={row.key} style={[styles.row, !isLast && styles.rowBorder]}>
        <View style={styles.rowTexts}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowDesc}>{row.desc}</Text>
        </View>
        <View style={styles.rowControl}>
          {saving === row.key ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => handleToggle(row.key, v)}
              trackColor={{ false: colors.line, true: colors.greenSoft }}
              thumbColor={prefs[row.key] ? colors.green : colors.muted}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View style={styles.bellWrap}>
            <Bell size={24} color={colors.green} />
          </View>
          <Text style={styles.headerText}>
            Gérez les alertes que vous souhaitez recevoir.
          </Text>
        </View>

        <SectionTitle title="Mes livraisons" />
        <Card style={styles.card}>
          {DELIVERY_PREFS.map((row, i) => renderRow(row, i === DELIVERY_PREFS.length - 1))}
        </Card>

        <SectionTitle title="Autres" />
        <Card style={styles.card}>
          {OTHER_PREFS.map((row, i) => renderRow(row, i === OTHER_PREFS.length - 1))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bellWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, fontSize: 13, color: colors.green, fontWeight: '600', lineHeight: 19 },
  card: { padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTexts: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  rowDesc: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  rowControl: { width: 52, alignItems: 'flex-end' },
});
