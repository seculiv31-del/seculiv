import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Props = {
  visible: boolean;
  onSubmit: (score: number, comment: string) => Promise<void>;
  onSkip: () => void;
};

const SCORE_LABELS: Record<number, string> = {
  1: 'Très mauvais',
  2: 'Mauvais',
  3: 'Correct',
  4: 'Bien',
  5: 'Excellent !',
};

export function RatingModal({ visible, onSubmit, onSkip }: Props) {
  const [score, setScore]         = useState(0);
  const [comment, setComment]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setScore(0);
    setComment('');
  }

  async function handleSubmit() {
    if (score === 0) return;
    setSubmitting(true);
    await onSubmit(score, comment.trim());
    setSubmitting(false);
    reset();
  }

  function handleSkip() {
    reset();
    onSkip();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleSkip}>
      <Pressable style={styles.overlay} onPress={handleSkip}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <Text style={styles.title}>Noter le livreur</Text>
          <Text style={styles.subtitle}>
            Votre avis est optionnel. Il aide à maintenir la qualité du service.
          </Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setScore(n)} hitSlop={10}>
                <Star
                  size={40}
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
          <Button title="Passer" variant="ghost" onPress={handleSkip} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gold,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    minHeight: 80,
  },
});
