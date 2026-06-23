import { ActivityIndicator, Pressable, StyleSheet, Text, type GestureResponderEvent } from 'react-native';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type ButtonVariant = 'primary' | 'ghost';

type ButtonProps = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.green} />
      ) : (
        <Text style={variant === 'primary' ? styles.primaryText : styles.ghostText}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.green,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.green,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  ghostText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '700',
  },
});
