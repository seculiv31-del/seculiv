import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Coords = { lat: number; lng: number };

type Props = {
  mode: 'driver' | 'client' | 'admin';
  pickup?: Coords;
  dropoff?: Coords & { address?: string };
  driverPosition?: Coords;
  driverName?: string;
  allDrivers?: Array<{ id: string; name?: string; lat: number; lng: number; status?: string }>;
  eta?: number | null;
  lastUpdatedAt?: Date;
};

export default function DeliveryMap({ eta, driverName }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        🗺️ Carte disponible sur l'application mobile
        {eta != null ? `\nArrivée estimée : ${eta} min${driverName ? ` · ${driverName}` : ''}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
