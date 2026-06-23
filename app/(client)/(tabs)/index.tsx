import { router } from 'expo-router';
import { Bell, Camera, CreditCard, Lock, Shield } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Logo } from '@/src/components/Logo';
import { SectionTitle } from '@/src/components/SectionTitle';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

const PARCEL_TYPE_INFO = [
  { label: 'Standard',           description: 'Colis courant, sans exigence particulière.'         },
  { label: 'Fragile',            description: 'Manipulation avec précaution renforcée.'            },
  { label: 'Valeur élevée',      description: 'Objet de valeur, suivi renforcé du trajet.'        },
  { label: 'Confidentiel',       description: 'Contenu discret, accès limité au livreur assigné.' },
  { label: 'Livraison sensible', description: 'Double vérification à la remise (renforcée).'      },
];

const SECURITY_HIGHLIGHTS = [
  { key: 'code', icon: Shield, label: 'Code secret', tint: colors.greenSoft, iconColor: colors.green },
  { key: 'photo', icon: Camera, label: 'Double photo', tint: colors.navySoft, iconColor: colors.white },
  { key: 'funds', icon: CreditCard, label: 'Fonds bloqués', tint: '#F6EFD9', iconColor: colors.gold },
] as const;

export default function ClientHomeScreen() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'Client';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Logo size={80} />
          {/* TODO Étape 6/7 : notifications réelles (commande assignée, code prêt, etc.) */}
          <Pressable style={styles.bellButton}>
            <Bell size={20} color={colors.navy} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Lock size={120} color={colors.white} style={styles.heroWatermark} />
          <Text style={styles.heroGreeting}>Bonjour {firstName} 👋</Text>
          <Text style={styles.heroTitle}>Envoyez en toute sécurité</Text>
          <Button title="Envoyer un colis" onPress={() => router.push('/new-order')} />
        </View>

        <View style={styles.highlights}>
          {SECURITY_HIGHLIGHTS.map(({ key, icon: Icon, label, tint, iconColor }) => (
            <View key={key} style={styles.highlightCard}>
              <View style={[styles.highlightIcon, { backgroundColor: tint }]}>
                <Icon size={20} color={iconColor} />
              </View>
              <Text style={styles.highlightLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View>
          <SectionTitle title="Types de colis" />
          <View style={styles.parcelList}>
            {PARCEL_TYPE_INFO.map((item) => (
              <Card key={item.label} style={styles.parcelCard}>
                <Text style={styles.parcelLabel}>{item.label}</Text>
                <Text style={styles.parcelDescription}>{item.description}</Text>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    right: -24,
    top: -24,
    opacity: 0.12,
  },
  heroGreeting: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9FB0CC',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    maxWidth: '85%',
  },
  highlights: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  highlightCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  highlightIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  parcelList: {
    gap: spacing.md,
  },
  parcelCard: {
    gap: 4,
  },
  parcelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  parcelDescription: {
    fontSize: 13,
    color: colors.muted,
  },
});
