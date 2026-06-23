import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Camera, CheckCircle2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { uploadDeliveryPhoto } from '@/src/lib/uploadPhoto';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type PhotoState = 'idle' | 'uploading' | 'done' | 'error';

type Props = {
  orderId: string;
  type: 'before' | 'after';
  onSuccess: (url: string) => void;
  disabled?: boolean;
};

export default function PhotoCapture({ orderId, type, onSuccess, disabled = false }: Props) {
  const [state, setState] = useState<PhotoState>('idle');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  const hint =
    type === 'before' ? 'Colis fermé, boîte visible' : 'Colis remis au destinataire';

  async function handlePress() {
    if (disabled || state === 'uploading' || state === 'done') return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Caméra requise',
        'SECŪL·iV a besoin de la caméra pour photographier la preuve de livraison. Activez-la dans les Réglages de l’appareil.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 1, base64: false });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setCapturedUri(uri);

    const now = new Date();
    // Géocodage inverse asynchrone : la ville apparaît dès qu'elle est disponible.
    let cityLabel = 'Dakar';
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        });
        if (place?.city) cityLabel = place.city;
        else if (place?.region) cityLabel = place.region;
      }
    } catch {
      // Géocodage échoué : on conserve "Dakar" comme fallback.
    }
    setTimestamp(
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' · ' +
        now.toLocaleDateString('fr-FR') +
        ` · ${cityLabel}`
    );

    setState('uploading');
    setErrorMsg(null);

    try {
      const { signedUrl } = await uploadDeliveryPhoto(orderId, type, uri);
      setState('done');
      onSuccess(signedUrl);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur lors de l’envoi.");
      setState('error');
    }
  }

  if (state === 'done' && capturedUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedUri }} style={styles.preview} resizeMode="cover" />
        <View style={styles.doneOverlay}>
          <CheckCircle2 size={20} color="#fff" />
          {timestamp && <Text style={styles.timestamp}>{timestamp}</Text>}
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.container, styles.idle, (disabled || state === 'uploading') && styles.dimmed]}
      onPress={handlePress}
      disabled={disabled || state === 'uploading'}
    >
      {state === 'uploading' ? (
        <View style={styles.centeredContent}>
          <ActivityIndicator color={colors.line} size="large" />
          <Text style={styles.uploadingText}>Envoi en cours…</Text>
        </View>
      ) : (
        <View style={styles.centeredContent}>
          <View style={styles.badgeWrap}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>REQUIS</Text>
            </View>
          </View>
          <Camera size={36} color={state === 'error' ? '#D14343' : colors.muted} />
          <Text style={styles.tapText}>Appuyer pour photographier</Text>
          <Text style={styles.hintText}>{hint}</Text>
          {state === 'error' && errorMsg && (
            <Text style={styles.errorText}>{errorMsg}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 160,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  idle: {
    backgroundColor: '#16263D',
    borderWidth: 1.5,
    borderColor: colors.navySoft,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.65,
  },
  centeredContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  badgeWrap: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  badge: {
    backgroundColor: '#D14343',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.8,
  },
  tapText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.line,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 11,
    color: '#D14343',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  uploadingText: {
    fontSize: 13,
    color: colors.line,
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  doneOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 80, 45, 0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  timestamp: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
});
