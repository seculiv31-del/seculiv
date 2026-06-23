import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.muted}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: {
    borderColor: '#D14343',
  },
  error: {
    fontSize: 12,
    color: '#D14343',
  },
});
