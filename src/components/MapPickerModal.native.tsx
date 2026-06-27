import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useState } from 'react';

import { Button } from './Button';
import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

const DAKAR = { latitude: 14.7167, longitude: -17.4677 };

type Coords = { lat: number; lng: number };

type Props = {
  visible: boolean;
  type: 'pickup' | 'dropoff';
  initialCoords?: Coords;
  onConfirm: (coords: Coords, reverseGeocode: (lat: number, lng: number) => Promise<string>) => void;
  onClose: () => void;
  reverseGeocode: (lat: number, lng: number) => Promise<string>;
};

export default function MapPickerModal({ visible, type, initialCoords, onConfirm, onClose, reverseGeocode }: Props) {
  const [draft, setDraft] = useState<Coords | undefined>(initialCoords);
  const [confirming, setConfirming] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconButton}>
            <X size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>
            {type === 'pickup' ? "Point d'enlèvement" : 'Point de livraison'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.hint}>Appuyez sur la carte ou faites glisser le marqueur.</Text>
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude:      draft?.lat ?? DAKAR.latitude,
            longitude:     draft?.lng ?? DAKAR.longitude,
            latitudeDelta:  0.08,
            longitudeDelta: 0.08,
          }}
          onPress={(e) => setDraft({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          })}
        >
          {draft && (
            <Marker
              coordinate={{ latitude: draft.lat, longitude: draft.lng }}
              draggable
              pinColor={type === 'pickup' ? colors.navy : colors.green}
              onDragEnd={(e) => setDraft({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })}
            />
          )}
        </MapView>
        <View style={styles.footer}>
          <Button
            title="Confirmer la position"
            disabled={!draft || confirming}
            loading={confirming}
            onPress={async () => {
              if (!draft || confirming) return;
              setConfirming(true);
              await onConfirm(draft, reverseGeocode);
              setConfirming(false);
            }}
          />
          <Button title="Annuler" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  iconButton: { padding: spacing.xs },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 13, color: colors.muted, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  footer: { padding: spacing.md, gap: spacing.sm },
});
