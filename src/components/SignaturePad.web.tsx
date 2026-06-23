import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Props = {
  recipientName: string;
  onOK: (signatureBase64: string) => void;
  onEmpty?: () => void;
};

export default function SignaturePad({ recipientName }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Signature de {recipientName} — disponible sur l&apos;application mobile
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  text: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
