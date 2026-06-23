import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Coords = { lat: number; lng: number };

type DriverPoint = {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  status?: string;
};

type Props = {
  mode: 'driver' | 'client' | 'admin';
  pickup?: Coords;
  dropoff?: Coords & { address?: string };
  driverPosition?: Coords;
  driverName?: string;
  allDrivers?: DriverPoint[];
  eta?: number | null;
  lastUpdatedAt?: Date;
};

const DAKAR = { latitude: 14.7167, longitude: -17.4677 };
const CLOSE_DELTA = { latitudeDelta: 0.012, longitudeDelta: 0.012 };
const FAR_DELTA = { latitudeDelta: 0.12, longitudeDelta: 0.12 };

function ll(c: Coords) {
  return { latitude: c.lat, longitude: c.lng };
}

// Marqueur livreur : cercle pulsant avec initiales.
function DriverMarker({ name, status }: { name?: string; status?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const bg = status === 'arrivee' ? colors.gold : colors.green;
  const initials = name
    ? name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase()
    : 'DR';

  return (
    <View style={markerStyles.wrap}>
      <Animated.View style={[markerStyles.halo, { backgroundColor: bg, opacity: pulse }]} />
      <View style={[markerStyles.circle, { backgroundColor: bg }]}>
        <Text style={markerStyles.initials}>{initials}</Text>
      </View>
    </View>
  );
}

const markerStyles = StyleSheet.create({
  wrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  initials: { fontSize: 11, fontWeight: '800', color: '#fff' },
});

export default function DeliveryMap({
  mode,
  pickup,
  dropoff,
  driverPosition,
  driverName,
  allDrivers,
  eta,
  lastUpdatedAt,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [secondsSince, setSecondsSince] = useState<number | null>(null);

  // Recentre automatiquement sur le livreur à chaque nouvelle position.
  useEffect(() => {
    if (!driverPosition || !mapRef.current) return;
    mapRef.current.animateToRegion({ ...ll(driverPosition), ...CLOSE_DELTA }, 500);
  }, [driverPosition?.lat, driverPosition?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ticker "il y a Xs".
  useEffect(() => {
    if (!lastUpdatedAt) { setSecondsSince(null); return; }
    const tick = () =>
      setSecondsSince(Math.floor((Date.now() - lastUpdatedAt.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  const center = driverPosition ?? pickup ?? dropoff;
  const initialRegion = center
    ? { ...ll(center), ...CLOSE_DELTA }
    : { ...DAKAR, ...FAR_DELTA };

  // Polyline passée (départ → livreur) en navy plein.
  const pastLine = pickup && driverPosition ? [ll(pickup), ll(driverPosition)] : null;
  // Polyline à venir (livreur → destination) en vert pointillé.
  const futureLine = driverPosition && dropoff ? [ll(driverPosition), ll(dropoff)] : null;

  const showOverlay = eta != null || secondsSince != null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        // TODO : ajouter une clé API Google Maps dans app.json pour la prod Android.
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
      >
        {/* Marqueur enlèvement */}
        {pickup && (
          <Marker
            coordinate={ll(pickup)}
            pinColor={colors.navy}
            title="Enlèvement"
            opacity={driverPosition ? 0.5 : 1}
          />
        )}

        {/* Marqueur destination */}
        {dropoff && (
          <Marker
            coordinate={ll(dropoff)}
            pinColor={colors.green}
            title={dropoff.address ?? 'Destination'}
          />
        )}

        {/* Marqueur livreur (mode driver ou client) */}
        {driverPosition && (mode === 'driver' || mode === 'client') && (
          <Marker coordinate={ll(driverPosition)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <DriverMarker name={driverName} />
          </Marker>
        )}

        {/* Marqueurs multi-livreurs (mode admin) */}
        {mode === 'admin' &&
          allDrivers?.map((d) => (
            <Marker
              key={d.id}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <DriverMarker name={d.name} status={d.status} />
            </Marker>
          ))}

        {/* Trajet passé */}
        {pastLine && (
          <Polyline coordinates={pastLine} strokeColor={colors.navy} strokeWidth={2} />
        )}

        {/* Trajet à venir — pointillé vert */}
        {futureLine && (
          <Polyline
            coordinates={futureLine}
            strokeColor={colors.green}
            strokeWidth={2}
            lineDashPattern={[8, 5]}
          />
        )}
      </MapView>

      {/* Overlay bas : ETA + dernière mise à jour */}
      {showOverlay && (
        <View style={styles.overlay}>
          {eta != null && (
            <Text style={styles.etaText}>
              Arrivée estimée dans {eta} min
              {driverName ? ` · ${driverName}` : ''}
            </Text>
          )}
          {secondsSince != null && (
            <Text style={styles.updateText}>Mis à jour il y a {secondsSince}s</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(27, 42, 74, 0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  etaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  updateText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
});
