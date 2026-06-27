import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';

import { Button } from './Button';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Coords = { lat: number; lng: number };

type Props = {
  visible: boolean;
  type: 'pickup' | 'dropoff';
  initialCoords?: Coords;
  onConfirm: (coords: Coords, reverseGeocode: (lat: number, lng: number) => Promise<string>) => void;
  onClose: () => void;
  reverseGeocode: (lat: number, lng: number) => Promise<string>;
};

// Sur web, la carte native n'est pas disponible — l'utilisateur saisit l'adresse par texte.
export default function MapPickerModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <MapPin size={32} color={colors.muted} />
          <Text style={styles.title}>Sélection sur carte</Text>
          <Text style={styles.body}>
            La sélection par carte est disponible uniquement sur l&apos;application mobile.
            Saisis l&apos;adresse dans le champ texte ci-dessus.
          </Text>
          <Button title="Fermer" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.xl, gap: spacing.md, alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body:  { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
