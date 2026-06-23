import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';

type Coords = { latitude: number; longitude: number };

interface RouteStep {
  instruction: string;
  maneuverLat: number;
  maneuverLng: number;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function osrmToFrench(type: string, modifier: string | undefined, street: string): string {
  const sur = street ? ` sur ${street}` : '';
  switch (type) {
    case 'depart':            return `Démarrez${sur}`;
    case 'arrive':            return 'Vous êtes arrivé à destination';
    case 'continue':          return `Continuez tout droit${sur}`;
    case 'new name':          return `Continuez${sur}`;
    case 'merge':             return `Rejoignez la voie${sur}`;
    case 'on ramp':           return `Prenez la bretelle${sur}`;
    case 'off ramp':          return `Quittez la voie rapide${sur}`;
    case 'roundabout':
    case 'rotary':            return `Prenez le rond-point${sur}`;
    case 'exit roundabout':
    case 'exit rotary':       return `Sortez du rond-point${sur}`;
    case 'fork':
      if (modifier === 'left')  return `Prenez à gauche au carrefour${sur}`;
      if (modifier === 'right') return `Prenez à droite au carrefour${sur}`;
      return `Continuez au carrefour${sur}`;
    case 'end of road':
      if (modifier === 'left')  return `Au bout de la route, tournez à gauche${sur}`;
      if (modifier === 'right') return `Au bout de la route, tournez à droite${sur}`;
      return `Au bout de la route, continuez${sur}`;
    case 'turn':
      switch (modifier) {
        case 'sharp left':   return `Tournez brusquement à gauche${sur}`;
        case 'left':         return `Tournez à gauche${sur}`;
        case 'slight left':  return `Légèrement à gauche${sur}`;
        case 'straight':     return `Continuez tout droit${sur}`;
        case 'slight right': return `Légèrement à droite${sur}`;
        case 'right':        return `Tournez à droite${sur}`;
        case 'sharp right':  return `Tournez brusquement à droite${sur}`;
        case 'uturn':        return `Faites demi-tour${sur}`;
        default:             return `Tournez${sur}`;
      }
    case 'use lane':
      if (modifier?.includes('left'))  return 'Prenez la voie de gauche';
      if (modifier?.includes('right')) return 'Prenez la voie de droite';
      return 'Continuez dans la même voie';
    default:
      return `Continuez${sur}`;
  }
}

async function fetchOsrmRoute(origin: Coords, destination: Coords): Promise<RouteStep[]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
    `?steps=true&annotations=false&overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`OSRM: ${data.code}`);
  const osrmSteps: any[] = data.routes[0]?.legs[0]?.steps ?? [];
  return osrmSteps.map((s) => ({
    instruction: osrmToFrench(s.maneuver.type, s.maneuver.modifier, s.name ?? ''),
    maneuverLat: s.maneuver.location[1],
    maneuverLng: s.maneuver.location[0],
  }));
}

function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'fr-FR', rate: 0.9, pitch: 1.0 });
}

export function useVoiceGuidance(
  currentPosition: Coords | null,
  destination: Coords | null,
  enabled: boolean
) {
  const [nextInstruction, setNextInstruction] = useState<string | null>(null);
  const [distanceToNext, setDistanceToNext]   = useState<number | null>(null);
  const [routeError, setRouteError]           = useState<string | null>(null);

  const stepsRef   = useRef<RouteStep[]>([]);
  const stepIdxRef = useRef(0);
  const ann200     = useRef(false);
  const ann50      = useRef(false);
  const destRef    = useRef<Coords | null>(null);

  // Re-fetch route when destination changes (or guidance first enabled)
  useEffect(() => {
    if (!enabled || !currentPosition || !destination) return;
    if (
      destRef.current?.latitude === destination.latitude &&
      destRef.current?.longitude === destination.longitude
    ) return;

    destRef.current = destination;
    setRouteError(null);
    fetchOsrmRoute(currentPosition, destination)
      .then((steps) => {
        stepsRef.current = steps;
        stepIdxRef.current = 0;
        ann200.current = false;
        ann50.current  = false;
        if (steps[0]) {
          setNextInstruction(steps[0].instruction);
          speak(steps[0].instruction);
        }
      })
      .catch(() => setRouteError('Guidage vocal indisponible — vérifiez la connexion.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, destination?.latitude, destination?.longitude]);

  // Update guidance on each position change
  useEffect(() => {
    if (!enabled || !currentPosition || stepsRef.current.length === 0) return;

    const idx  = stepIdxRef.current;
    const step = stepsRef.current[idx];
    if (!step) return;

    const dist = haversineMeters(
      currentPosition.latitude,
      currentPosition.longitude,
      step.maneuverLat,
      step.maneuverLng
    );

    setDistanceToNext(dist);
    setNextInstruction(step.instruction);

    // Passed maneuver point → advance
    if (dist < 15 && idx < stepsRef.current.length - 1) {
      const next = idx + 1;
      stepIdxRef.current = next;
      ann200.current = false;
      ann50.current  = false;
      speak(stepsRef.current[next].instruction);
      return;
    }

    if (dist < 200 && !ann200.current) {
      ann200.current = true;
      const rounded = Math.max(10, Math.round(dist / 10) * 10);
      speak(`Dans ${rounded} mètres, ${step.instruction}`);
    }

    if (dist < 50 && !ann50.current) {
      ann50.current = true;
      speak(step.instruction);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentPosition?.latitude, currentPosition?.longitude]);

  // Stop speech when guidance disabled
  useEffect(() => {
    if (!enabled) {
      Speech.stop();
      setNextInstruction(null);
      setDistanceToNext(null);
    }
  }, [enabled]);

  return { nextInstruction, distanceToNext, routeError };
}
