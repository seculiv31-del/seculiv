import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Props = {
  recipientName: string;
  onOK: (signatureBase64: string) => void;
  onEmpty?: () => void;
};

export default function SignaturePad({ recipientName, onOK, onEmpty }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; padding: 0; height: 100%; }
    .m-signature-pad--body { border: none; height: 100%; }
    .m-signature-pad--footer { display: none; }
    body { background: white; margin: 0; padding: 0; }
    canvas { width: 100% !important; height: 100% !important; }
  `;

  return (
    <View style={styles.container}>
      <Text style={styles.recipientLabel}>Signature de {recipientName}</Text>
      <Text style={styles.hint}>Tracez votre signature dans le cadre ci-dessous</Text>

      <View style={styles.padWrapper}>
        <SignatureCanvas
          ref={ref}
          onOK={(sig: string) => onOK(sig)}
          onEmpty={() => onEmpty?.()}
          onBegin={() => setHasStroke(true)}
          penColor="#1B2A4A"
          backgroundColor="white"
          webStyle={webStyle}
          style={styles.canvas}
        />
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => {
            ref.current?.clearSignature();
            setHasStroke(false);
          }}
        >
          <Text style={styles.btnGhostText}>Effacer</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, !hasStroke && styles.btnDisabled]}
          onPress={() => ref.current?.readSignature()}
          disabled={!hasStroke}
        >
          <Text style={[styles.btnPrimaryText, !hasStroke && styles.btnDisabledText]}>
            Valider la signature
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  recipientLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.muted },
  padWrapper: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  canvas: { flex: 1 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  btnPrimary: { backgroundColor: colors.navy },
  btnPrimaryText: { fontSize: 14, fontWeight: '600', color: 'white' },
  btnDisabled: { backgroundColor: colors.line },
  btnDisabledText: { color: colors.muted },
});
