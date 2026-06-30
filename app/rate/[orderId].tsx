import { useLocalSearchParams, router } from 'expo-router';
import { CheckCircle2, Package, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';
import type { Order } from '@/src/types';

const SCORE_LABELS: Record<number, string> = {
  1: 'Très mauvais',
  2: 'Mauvais',
  3: 'Correct',
  4: 'Bien',
  5: 'Excellent !',
};

export default function RecipientRatingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder]           = useState<Order | null>(null);
  const [loading, setLoading]       = useState(true);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [score, setScore]           = useState(0);
  const [comment, setComment]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    if (!orderId) return;

    async function load() {
      const [orderRes, ratingRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId).single(),
        supabase
          .from('delivery_ratings')
          .select('id')
          .eq('order_id', orderId)
          .eq('rater_role', 'destinataire')
          .maybeSingle(),
      ]);

      if (orderRes.data) setOrder(orderRes.data as Order);
      setAlreadyRated(!!ratingRes.data);
      setLoading(false);
    }

    load();
  }, [orderId]);

  async function handleSubmit() {
    if (!orderId || score === 0) return;
    setSubmitting(true);

    await supabase.from('delivery_ratings').insert({
      order_id:   orderId,
      rated_by:   null,
      rater_role: 'destinataire',
      score,
      comment: comment.trim() || null,
    });

    setDone(true);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.green} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order || order.status !== 'livree') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <Package size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Livraison introuvable</Text>
          <Text style={styles.emptySubtitle}>Ce lien de notation n&apos;est plus valide.</Text>
          <Button title="Retour" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (alreadyRated || done) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <CheckCircle2 size={56} color={colors.green} />
          <Text style={styles.doneTitle}>
            {done ? 'Merci pour votre avis !' : 'Avis déjà enregistré'}
          </Text>
          <Text style={styles.doneSubtitle}>
            Votre notation contribue à la qualité du service.
          </Text>
          <Button title="Fermer" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.headerBlock}>
          <Text style={styles.title}>Évaluez votre livreur</Text>
          <Text style={styles.subtitle}>
            Votre colis vient d&apos;être livré à {order.dropoff.address}.{'\n'}
            Votre avis est optionnel — il aide à maintenir la qualité du service.
          </Text>
        </View>

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setScore(n)} hitSlop={12}>
              <Star
                size={48}
                color={colors.gold}
                fill={n <= score ? colors.gold : 'transparent'}
              />
            </Pressable>
          ))}
        </View>

        {score > 0 && (
          <Text style={styles.scoreLabel}>{SCORE_LABELS[score]}</Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="Commentaire optionnel…"
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          value={comment}
          onChangeText={setComment}
          maxLength={300}
        />

        <Button
          title="Envoyer mon avis"
          onPress={handleSubmit}
          loading={submitting}
          disabled={score === 0}
        />

        <Pressable onPress={() => router.back()} style={styles.skipBtn}>
          <Text style={styles.skipText}>Passer</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  doneSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  headerBlock: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  scoreLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gold,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    minHeight: 88,
    backgroundColor: colors.white,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    fontSize: 14,
    color: colors.muted,
  },
});
