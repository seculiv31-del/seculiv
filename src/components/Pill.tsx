import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

export type PillTone = 'green' | 'amber' | 'red' | 'gray' | 'navy';

type PillProps = {
  label: string;
  tone?: PillTone;
};

const TONE_STYLES: Record<PillTone, { bg: string; text: string }> = {
  green: { bg: colors.greenSoft, text: '#2E7D43' },
  amber: { bg: '#FBF0DC', text: '#A9710A' },
  red: { bg: '#FBE7E7', text: '#D14343' },
  gray: { bg: colors.line, text: colors.muted },
  navy: { bg: colors.navySoft, text: colors.white },
};

export function Pill({ label, tone = 'gray' }: PillProps) {
  const palette = TONE_STYLES[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
