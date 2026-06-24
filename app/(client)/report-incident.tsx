import { router } from 'expo-router';
import { AlertTriangle, CheckCircle, ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

const INCIDENT_TYPES = [
  'Accident de la route',
  'Vol ou tentative de vol',
  'Colis endommagé',
  'Livreur absent / injoignable',
  'Comportement incorrect du livreur',
  'Autre incident',
];

export default function ReportIncidentScreen() {
  const { profile } = useAuth();
  const [type, setType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = type !== null && description.trim().length >= 10;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);

    const { error } = await supabase.functions.invoke('report-incident', {
      body: {
        type,
        description: description.trim(),
        orderRef: orderRef.trim() || null,
        userName: profile?.full_name ?? null,
        userPhone: profile?.phone ?? null,
      },
    });

    setSending(false);

    if (error) {
      Alert.alert(
        'Envoi échoué',
        "Une erreur est survenue. Réessayez ou contactez seculiv31@gmail.com directement.",
        [{ text: 'OK' }]
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle size={48} color={colors.green} />
          </View>
          <Text style={styles.successTitle}>Rapport envoyé</Text>
          <Text style={styles.successText}>
            Votre rapport a été transmis directement à l'équipe SECULIV. Nous reviendrons vers vous
            dans les plus brefs délais.
          </Text>
          <Button title="Retour au compte" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={22} color={colors.navy} />
          </Pressable>
          <Text style={styles.pageTitle}>Signaler un incident</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.alertBanner}>
          <AlertTriangle size={18} color="#E68A00" />
          <Text style={styles.alertText}>
            En cas de danger immédiat, appelez le 17 (Police) ou le 15 (SAMU).
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Type d'incident *</Text>
          <View style={styles.typeGrid}>
            {INCIDENT_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.typeChip, type === t && styles.typeChipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={styles.textarea}
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez ce qui s'est passé (lieu, heure, circonstances…)"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>{description.trim().length} caractère{description.trim().length > 1 ? 's' : ''} — minimum 10</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Numéro de commande (facultatif)</Text>
          <TextInput
            style={styles.input}
            value={orderRef}
            onChangeText={setOrderRef}
            placeholder="Ex. CMD-20240101-001"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
          />
        </View>

        <Button
          title="Envoyer le rapport"
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={sending}
        />

        <Text style={styles.footer}>
          Le rapport sera transmis directement à{' '}
          <Text style={styles.footerEmail}>seculiv31@gmail.com</Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },

  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#FFF3E0',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertText: { flex: 1, fontSize: 13, color: '#7A4500', lineHeight: 19 },

  section: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  typeChipActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  typeChipText: { fontSize: 13, fontWeight: '500', color: colors.ink },
  typeChipTextActive: { color: colors.white, fontWeight: '700' },

  textarea: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.line,
  },
  hint: { fontSize: 11, color: colors.muted },

  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
  },

  footer: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  footerEmail: { color: colors.navy, fontWeight: '700' },

  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  successText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
});
