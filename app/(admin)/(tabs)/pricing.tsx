import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { SectionTitle } from '@/src/components/SectionTitle';
import { TextField } from '@/src/components/TextField';
import { clearPricingCache } from '@/src/lib/pricing';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

type Fields = {
  base_fare:          string;
  price_per_km:       string;
  price_per_min:      string;
  minimum_fare:       string;
  supp_standard:      string;
  supp_fragile:       string;
  supp_valeur_elevee: string;
  supp_confidentiel:  string;
  supp_sensible:      string;
};

const FIELD_KEYS = [
  'base_fare', 'price_per_km', 'price_per_min', 'minimum_fare',
  'supp_standard', 'supp_fragile', 'supp_valeur_elevee', 'supp_confidentiel', 'supp_sensible',
] as const;

const DEFAULT_FIELDS: Fields = {
  base_fare:          '600',
  price_per_km:       '150',
  price_per_min:      '25',
  minimum_fare:       '1000',
  supp_standard:      '0',
  supp_fragile:       '200',
  supp_valeur_elevee: '400',
  supp_confidentiel:  '600',
  supp_sensible:      '800',
};

export default function AdminPricingScreen() {
  const [fields,  setFields]  = useState<Fields>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('pricing_config')
      .select('key, value');

    if (fetchError || !data) {
      setError('Impossible de charger la configuration tarifaire.');
      setLoading(false);
      return;
    }

    const map = Object.fromEntries(data.map(({ key, value }) => [key, String(value)]));
    setFields((prev) => ({ ...prev, ...map }));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadConfig(); }, [loadConfig]));

  function setField(key: keyof Fields, raw: string) {
    // N'autoriser que les chiffres
    const clean = raw.replace(/[^0-9]/g, '');
    setFields((prev) => ({ ...prev, [key]: clean }));
  }

  async function handleSave() {
    // Validation : toutes les valeurs doivent être des entiers ≥ 0
    for (const key of FIELD_KEYS) {
      const v = Number(fields[key]);
      if (isNaN(v) || v < 0 || !Number.isFinite(v)) {
        Alert.alert('Valeur invalide', `La valeur pour "${key}" doit être un entier positif.`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    const rows = FIELD_KEYS.map((key) => ({ key, value: Number(fields[key]) }));

    const { error: upsertError } = await supabase
      .from('pricing_config')
      .upsert(rows, { onConflict: 'key' });

    setSaving(false);

    if (upsertError) {
      setError(`Échec de la sauvegarde : ${upsertError.message}`);
      return;
    }

    // Invalide le cache in-mémoire pour que la prochaine commande recalcule avec les nouveaux tarifs
    clearPricingCache();

    Alert.alert('Tarification mise à jour', 'Les nouveaux tarifs sont actifs immédiatement pour toutes les prochaines commandes.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <SectionTitle title="Tarification" />

          {/* Base tarifaire */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Base tarifaire</Text>
            <Card style={styles.card}>
              <FieldRow
                label="Prise en charge"
                unit="F"
                value={fields.base_fare}
                onChangeText={(v) => setField('base_fare', v)}
                hint="Montant fixe facturé à chaque course"
              />
              <Separator />
              <FieldRow
                label="Tarif minimum"
                unit="F"
                value={fields.minimum_fare}
                onChangeText={(v) => setField('minimum_fare', v)}
                hint="Prix plancher (appliqué si le calcul donne moins)"
              />
            </Card>
          </View>

          {/* Prix à la distance / durée */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Distance &amp; durée</Text>
            <Card style={styles.card}>
              <FieldRow
                label="Prix au kilomètre"
                unit="F / km"
                value={fields.price_per_km}
                onChangeText={(v) => setField('price_per_km', v)}
                hint="Facteur distance (distance routière estimée × 1,4)"
              />
              <Separator />
              <FieldRow
                label="Prix à la minute"
                unit="F / min"
                value={fields.price_per_min}
                onChangeText={(v) => setField('price_per_min', v)}
                hint="Basé sur ~20 km/h en ville"
              />
            </Card>
          </View>

          {/* Suppléments par type de colis */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Suppléments par type de colis</Text>
            <Card style={styles.card}>
              <FieldRow
                label="Standard"
                unit="F"
                value={fields.supp_standard}
                onChangeText={(v) => setField('supp_standard', v)}
              />
              <Separator />
              <FieldRow
                label="Fragile"
                unit="F"
                value={fields.supp_fragile}
                onChangeText={(v) => setField('supp_fragile', v)}
              />
              <Separator />
              <FieldRow
                label="Valeur élevée"
                unit="F"
                value={fields.supp_valeur_elevee}
                onChangeText={(v) => setField('supp_valeur_elevee', v)}
              />
              <Separator />
              <FieldRow
                label="Confidentiel"
                unit="F"
                value={fields.supp_confidentiel}
                onChangeText={(v) => setField('supp_confidentiel', v)}
              />
              <Separator />
              <FieldRow
                label="Livraison sensible"
                unit="F"
                value={fields.supp_sensible}
                onChangeText={(v) => setField('supp_sensible', v)}
              />
            </Card>
          </View>

          {/* Simulateur rapide */}
          <PriceSimulator fields={fields} />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button title="Enregistrer les tarifs" onPress={handleSave} loading={saving} />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Ligne de champ ───────────────────────────────────────────────────────────

function FieldRow({
  label, unit, value, onChangeText, hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLeft}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      </View>
      <View style={styles.fieldInputWrap}>
        <TextField
          label=""
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          style={styles.fieldInput}
        />
        <Text style={styles.fieldUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

// ─── Simulateur rapide ────────────────────────────────────────────────────────

function PriceSimulator({ fields }: { fields: Fields }) {
  // Simule 3 km et 9 min (trajet moyen Dakar)
  const KM = 3;
  const MIN = 9;

  function simulate(supp: number): number {
    const base    = Number(fields.base_fare) || 0;
    const dist    = KM  * (Number(fields.price_per_km)  || 0);
    const dur     = MIN * (Number(fields.price_per_min) || 0);
    const raw     = base + dist + dur;
    const floored = Math.max(raw, Number(fields.minimum_fare) || 0);
    return Math.ceil((floored + supp) / 100) * 100;
  }

  const rows = [
    { label: 'Standard',           supp: Number(fields.supp_standard)      || 0 },
    { label: 'Fragile',            supp: Number(fields.supp_fragile)        || 0 },
    { label: 'Valeur élevée',      supp: Number(fields.supp_valeur_elevee)  || 0 },
    { label: 'Confidentiel',       supp: Number(fields.supp_confidentiel)   || 0 },
    { label: 'Livraison sensible', supp: Number(fields.supp_sensible)       || 0 },
  ];

  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>Simulation (3 km · 9 min)</Text>
      <Card style={styles.card}>
        {rows.map((r, i) => (
          <View key={r.label}>
            {i > 0 && <Separator />}
            <View style={styles.simRow}>
              <Text style={styles.simLabel}>{r.label}</Text>
              <Text style={styles.simValue}>{simulate(r.supp).toLocaleString('fr-FR')} F</Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content:  { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  group:      { gap: spacing.sm },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  card:       { gap: 0, paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },

  fieldRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.md },
  fieldLeft:     { flex: 1, gap: 2 },
  fieldLabel:    { fontSize: 14, fontWeight: '600', color: colors.ink },
  fieldHint:     { fontSize: 11, color: colors.muted },
  fieldInputWrap:{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fieldInput:    { width: 90, textAlign: 'right' },
  fieldUnit:     { fontSize: 12, fontWeight: '600', color: colors.muted, minWidth: 36 },

  sep: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },

  simRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  simLabel: { fontSize: 14, color: colors.ink },
  simValue: { fontSize: 14, fontWeight: '800', color: colors.navy },

  errorText: { fontSize: 13, color: '#D14343', textAlign: 'center' },
});
