import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function SectionTitle({ title, subtitle, action }: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  texts: {
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
  },
});
