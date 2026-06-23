// Composant de vérification d'identité pour les livraisons sensibles.
//
// SÉCURITÉ DONNÉE PERSONNELLE :
//   - La photo est uploadée dans le bucket PRIVÉ "id-verifications"
//     (aucune policy SELECT → le livreur ne peut pas la relire après capture).
//   - Seul le chemin Storage est stocké dans orders.id_photo_url (jamais une signed URL).
//   - La photo n'apparaît jamais dans le certificat client (voir generate-certificate).
//   - Seul un admin via admin-view-id peut la consulter, avec traçabilité.
//
// TODO : Politique de conservation/suppression des pièces d'identité à définir
//        avant lancement (conformité CDP Sénégal — Commission des Données Personnelles).
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, Shield, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

// Violet distinctif du mode sensible — utilisé uniquement dans ce flow.
const VIOLET = '#6B4FA8';
const VIOLET_SOFT = '#F0ECFA';

type Props = {
  orderId: string;
  expectedIdType: string | null;
  expectedIdName: string | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
};

type State = 'idle' | 'uploading' | 'done' | 'error';

export default function IdVerification({
  orderId,
  expectedIdType,
  expectedIdName,
  onSuccess,
  onError,
}: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const idTypeLabel = expectedIdType
    ? { cni: 'Carte Nationale d\'Identité', passeport: 'Passeport', permis: 'Permis de conduire' }[expectedIdType] ?? expectedIdType
    : 'Pièce d\'identité';

  async function handleCapture() {
    if (state === 'uploading' || state === 'done') return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Caméra requise',
        'SECŪL·iV doit accéder à la caméra pour photographier la pièce d\'identité du destinataire.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      base64: false,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setState('uploading');
    setErrorMsg(null);

    try {
      // Lit le fichier et prépare le blob pour l'upload.
      const response = await fetch(uri);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());

      // Chemin dans le bucket id-verifications (private, upload-only pour le livreur).
      const storagePath = `id/${orderId}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('id-verifications')
        .upload(storagePath, bytes, {
          contentType: 'image/jpeg',
          upsert: true, // écrase si le livreur reprend après un crash
        });

      if (uploadErr) throw new Error(uploadErr.message);

      // Met à jour la commande : chemin + horodatage.
      // Ne stocke PAS de signed URL — le chemin seul est enregistré.
      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          id_photo_url: storagePath,
          id_verified_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (updateErr) throw new Error(updateErr.message);

      setState('done');
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la capture.';
      setErrorMsg(msg);
      setState('error');
      onError(msg);
    }
  }

  if (state === 'done') {
    return (
      <View style={styles.doneBox}>
        <CheckCircle2 size={22} color={VIOLET} />
        <Text style={styles.doneText}>Identité photographiée</Text>
        <Text style={styles.donePrivacy}>Photo chiffrée, conservée pour preuve.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête : infos attendues */}
      <View style={styles.header}>
        <Shield size={16} color={VIOLET} />
        <Text style={styles.headerTitle}>Vérification d&apos;identité</Text>
      </View>

      <View style={styles.expectedBox}>
        <View style={styles.expectedRow}>
          <Text style={styles.expectedLabel}>Type de pièce attendue</Text>
          <Text style={styles.expectedValue}>{idTypeLabel}</Text>
        </View>
        <View style={styles.expectedRow}>
          <User size={14} color={VIOLET} />
          <Text style={styles.expectedName}>{expectedIdName ?? '—'}</Text>
        </View>
        <Text style={styles.expectedHint}>
          Vérifiez visuellement que le nom correspond avant de photographier.
        </Text>
      </View>

      {/* Zone de capture avec cadre de scan violet */}
      <Pressable
        style={[styles.scanZone, state === 'uploading' && styles.scanZoneDimmed]}
        onPress={handleCapture}
        disabled={state === 'uploading'}
      >
        {state === 'uploading' ? (
          <View style={styles.scanCenter}>
            <ActivityIndicator color={VIOLET} size="large" />
            <Text style={styles.scanUploading}>Envoi sécurisé…</Text>
          </View>
        ) : (
          <>
            {/* Coins violets style scan */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            <View style={styles.scanCenter}>
              <Camera size={36} color={state === 'error' ? '#D14343' : VIOLET} />
              <Text style={styles.scanTap}>Photographier la pièce d&apos;identité</Text>
              <Text style={styles.scanSub}>Face avec photo bien visible</Text>
              {state === 'error' && errorMsg && (
                <Text style={styles.scanError}>{errorMsg}</Text>
              )}
            </View>
          </>
        )}
      </Pressable>

      {/* Mention légale de confidentialité */}
      <View style={styles.privacyNote}>
        <Text style={styles.privacyText}>
          Photo chiffrée, conservée pour preuve.{' '}
          <Text style={styles.privacyBold}>Le livreur ne peut pas la consulter ensuite.</Text>
          {' '}Accessible uniquement à l&apos;administration SECULIV sur demande tracée.
        </Text>
      </View>
    </View>
  );
}

const CORNER_SIZE = 18;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: VIOLET,
  },
  expectedBox: {
    backgroundColor: VIOLET_SOFT,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#D9CEEF',
  },
  expectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  expectedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: VIOLET,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  expectedValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 2,
  },
  expectedName: {
    fontSize: 15,
    fontWeight: '800',
    color: VIOLET,
  },
  expectedHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  scanZone: {
    height: 170,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: VIOLET,
    borderStyle: 'dashed' as const,
    backgroundColor: VIOLET_SOFT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  scanZoneDimmed: {
    opacity: 0.7,
  },
  // Coins style scan
  corner: {
    position: 'absolute' as const,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: spacing.sm,
    left: spacing.sm,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: VIOLET,
  },
  cornerTR: {
    top: spacing.sm,
    right: spacing.sm,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: VIOLET,
  },
  cornerBL: {
    bottom: spacing.sm,
    left: spacing.sm,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: VIOLET,
  },
  cornerBR: {
    bottom: spacing.sm,
    right: spacing.sm,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: VIOLET,
  },
  scanCenter: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  scanTap: {
    fontSize: 14,
    fontWeight: '600',
    color: VIOLET,
    textAlign: 'center',
  },
  scanSub: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  scanUploading: {
    fontSize: 13,
    fontWeight: '600',
    color: VIOLET,
    marginTop: spacing.xs,
  },
  scanError: {
    fontSize: 11,
    color: '#D14343',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  privacyNote: {
    backgroundColor: '#F5F7FA',
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  privacyText: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 15,
  },
  privacyBold: {
    fontWeight: '700',
    color: colors.ink,
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: VIOLET_SOFT,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#D9CEEF',
  },
  doneText: {
    fontSize: 14,
    fontWeight: '700',
    color: VIOLET,
    flex: 1,
  },
  donePrivacy: {
    fontSize: 11,
    color: colors.muted,
  },
});
