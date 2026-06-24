import { router } from 'expo-router';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle,
  CreditCard,
  EyeOff,
  Gem,
  Lock,
  Package,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Logo } from '@/src/components/Logo';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

const SECURITY_HIGHLIGHTS = [
  { key: 'code',  icon: Shield,    label: 'Code secret',   tint: colors.greenSoft,  iconColor: colors.green },
  { key: 'photo', icon: Camera,    label: 'Double photo',  tint: colors.navySoft,   iconColor: colors.white },
  { key: 'funds', icon: CreditCard,label: 'Fonds bloqués', tint: '#F6EFD9',         iconColor: colors.gold  },
] as const;

const FORMULAS = [
  {
    key: 'standard',
    icon: Package,
    name: 'Standard',
    description: 'Pour vos envois du quotidien sans contrainte particulière. La solution simple et efficace pour tout colis courant.',
    advantage: 'Tarif économique · Livraison rapide',
    target: 'Particuliers · Petits commerces',
    tint: '#EEF2FF',
    iconColor: '#4A5FD4',
  },
  {
    key: 'fragile',
    icon: AlertTriangle,
    name: 'Fragile',
    description: 'Vos objets délicats sont manipulés avec précaution renforcée à chaque étape, du départ jusqu\'à la remise.',
    advantage: 'Manipulation douce · Emballage protégé',
    target: 'Particuliers · Artisans · Boutiques',
    tint: '#FFF3E0',
    iconColor: '#E68A00',
  },
  {
    key: 'value',
    icon: Gem,
    name: 'Valeur élevée',
    description: 'Suivi renforcé en temps réel pour les colis de grande valeur. Livreur sélectionné, traçabilité complète du trajet.',
    advantage: 'Traçabilité totale · Livreur vérifié',
    target: 'Bijouteries · Banques · Particuliers (bijoux, montres)',
    tint: '#FDF6E3',
    iconColor: colors.gold,
  },
  {
    key: 'confidentiel',
    icon: EyeOff,
    name: 'Confidentiel',
    description: 'Envoi totalement discret. Accès strictement limité au livreur assigné, aucun tiers informé du contenu.',
    advantage: 'Confidentialité totale · Accès restreint',
    target: 'Entreprises · Notaires · Professions libérales',
    tint: '#F0F4FF',
    iconColor: colors.navy,
  },
  {
    key: 'sensible',
    icon: ShieldCheck,
    name: 'Livraison sensible',
    description: 'Double vérification obligatoire à la remise pour les envois critiques. Sécurité maximale garantie par protocole.',
    advantage: 'Double vérification · Signature électronique',
    target: 'Pharmacies · Hôpitaux · Laboratoires · Institutions',
    tint: colors.greenSoft,
    iconColor: colors.green,
  },
] as const;

export default function ClientHomeScreen() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'Client';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Logo size={80} />
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

        <View style={styles.formulasSection}>
          <Text style={styles.sectionTitle}>Nos formules de livraison</Text>
          <Text style={styles.sectionSubtitle}>
            Choisissez la formule adaptée à votre besoin lors de chaque envoi.
          </Text>
          {FORMULAS.map(({ key, icon: Icon, name, description, advantage, target, tint, iconColor }) => (
            <View key={key} style={styles.formulaCard}>
              <View style={styles.formulaHeader}>
                <View style={[styles.formulaIconBadge, { backgroundColor: tint }]}>
                  <Icon size={22} color={iconColor} />
                </View>
                <Text style={styles.formulaName}>{name}</Text>
              </View>
              <Text style={styles.formulaDesc}>{description}</Text>
              <View style={styles.formulaBadges}>
                <View style={styles.formulaBadge}>
                  <CheckCircle size={13} color={colors.green} />
                  <Text style={styles.formulaBadgeText}>{advantage}</Text>
                </View>
                <View style={[styles.formulaBadge, styles.formulaBadgeTarget]}>
                  <Users size={13} color={colors.muted} />
                  <Text style={[styles.formulaBadgeText, styles.formulaBadgeTargetText]}>{target}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bellButton: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  hero: {
    backgroundColor: colors.navy, borderRadius: radius.lg,
    padding: spacing.xl, gap: spacing.md, overflow: 'hidden',
  },
  heroWatermark: { position: 'absolute', right: -24, top: -24, opacity: 0.12 },
  heroGreeting: { fontSize: 14, fontWeight: '600', color: '#9FB0CC' },
  heroTitle:    { fontSize: 24, fontWeight: '800', color: colors.white, maxWidth: '85%' },
  highlights: { flexDirection: 'row', gap: spacing.sm },
  highlightCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    alignItems: 'center', gap: spacing.sm,
  },
  highlightIcon: {
    width: 40, height: 40, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  highlightLabel: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },

  formulasSection: { gap: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sectionSubtitle: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: -spacing.xs },

  formulaCard: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  formulaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  formulaIconBadge: {
    width: 46, height: 46, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  formulaName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  formulaDesc: { fontSize: 13, color: colors.muted, lineHeight: 20 },
  formulaBadges: { gap: spacing.xs, marginTop: spacing.xs },
  formulaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  formulaBadgeTarget: { marginTop: 2 },
  formulaBadgeText: { fontSize: 12, fontWeight: '600', color: colors.green },
  formulaBadgeTargetText: { color: colors.muted, fontWeight: '500' },
});
