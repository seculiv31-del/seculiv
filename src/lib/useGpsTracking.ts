import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from './supabase';

type Coords = { lat: number; lng: number };

type Props = {
  orderId: string;
  active: boolean;
  dropoffAddress: string;
};

type Result = {
  eta: number | null;
  isTracking: boolean;
  error: string | null;
  currentPosition: { latitude: number; longitude: number } | null;
  destinationCoords: { latitude: number; longitude: number } | null;
};

// Distance Haversine en km entre deux coordonnées.
function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Hook GPS livreur — actif uniquement entre les statuts enlevement → arrivee
// pour économiser la batterie. Arrêté proprement à chaque changement d'état.
export function useGpsTracking({ orderId, active, dropoffAddress }: Props): Result {
  const [eta, setEta] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const dropoffRef = useRef<Coords | null>(null);

  useEffect(() => {
    if (!active) {
      subRef.current?.remove();
      subRef.current = null;
      setIsTracking(false);
      return;
    }

    let cancelled = false;

    async function start() {
      // Permission localisation
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Position requise',
          'SECULIV a besoin de ta position pour sécuriser la livraison. Active la localisation dans les Réglages.',
          [{ text: 'OK' }]
        );
        setError('Permission de localisation refusée.');
        return;
      }

      // Géocode la destination une fois au démarrage pour le calcul ETA.
      try {
        const geo = await Location.geocodeAsync(dropoffAddress);
        if (geo[0]) {
          dropoffRef.current = { lat: geo[0].latitude, lng: geo[0].longitude };
          setDestinationCoords({ latitude: geo[0].latitude, longitude: geo[0].longitude });
        }
      } catch {
        // Géocodage échoué : ETA indisponible, la diffusion GPS continue quand même.
      }

      if (cancelled) return;

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (loc) => {
          const { latitude, longitude, accuracy, heading, speed, altitude } = loc.coords;
          setCurrentPosition({ latitude, longitude });

          await supabase.from('gps_tracking').insert({
            order_id: orderId,
            lat: latitude,
            lng: longitude,
            accuracy: accuracy ?? null,
            heading: heading ?? null,
            speed: speed ?? null,
            altitude: altitude ?? null,
          });

          // ETA : distance Haversine ÷ 30 km/h (vitesse moyenne Dakar urbain).
          // TODO Étape 6.6 : affiner avec les données de trafic temps réel.
          if (dropoffRef.current) {
            const distKm = haversineKm(
              { lat: latitude, lng: longitude },
              dropoffRef.current
            );
            const etaMin = Math.max(1, Math.round((distKm / 30) * 60));
            setEta(etaMin);
            await supabase
              .from('orders')
              .update({ eta_minutes: etaMin })
              .eq('id', orderId);
          }
        }
      );

      if (!cancelled) {
        subRef.current = sub;
        setIsTracking(true);
        setError(null);
      } else {
        sub.remove();
      }
    }

    start().catch((e) => {
      setError(e instanceof Error ? e.message : 'Erreur GPS.');
    });

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
      setIsTracking(false);
      setCurrentPosition(null);
    };
  }, [active, orderId, dropoffAddress]);

  return { eta, isTracking, error, currentPosition, destinationCoords };
}
