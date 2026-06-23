import { supabase } from './supabase';
import type { ParcelType } from '@/src/types';

export type Coords = { lat: number; lng: number };

export type PricingConfig = {
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  minimum_fare: number;
  supp_standard: number;
  supp_fragile: number;
  supp_valeur_elevee: number;
  supp_confidentiel: number;
  supp_sensible: number;
};

export type PriceBreakdown = {
  baseFare: number;
  distanceCost: number;
  durationCost: number;
  supplement: number;
  total: number;
  km: number;
  minutes: number;
};

let _cache: PricingConfig | null = null;

export function clearPricingCache(): void {
  _cache = null;
}

export async function loadPricingConfig(): Promise<PricingConfig> {
  if (_cache) return _cache;

  const { data, error } = await supabase
    .from('pricing_config')
    .select('key, value');

  if (error || !data) throw new Error('Impossible de charger la configuration tarifaire.');

  const map = Object.fromEntries(data.map(({ key, value }) => [key, Number(value)]));

  _cache = {
    base_fare:         map.base_fare         ?? 600,
    price_per_km:      map.price_per_km      ?? 150,
    price_per_min:     map.price_per_min     ?? 25,
    minimum_fare:      map.minimum_fare      ?? 1000,
    supp_standard:     map.supp_standard     ?? 0,
    supp_fragile:      map.supp_fragile      ?? 200,
    supp_valeur_elevee:map.supp_valeur_elevee?? 400,
    supp_confidentiel: map.supp_confidentiel ?? 600,
    supp_sensible:     map.supp_sensible     ?? 800,
  };

  return _cache;
}

/** Distance à vol d'oiseau (Haversine) × 1.4 pour estimer le trajet urbain à Dakar. Retourne km. */
export function calculateDistance(pickup: Coords, dropoff: Coords): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(dropoff.lat - pickup.lat);
  const dLng = toRad(dropoff.lng - pickup.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(pickup.lat)) * Math.cos(toRad(dropoff.lat)) * Math.sin(dLng / 2) ** 2;
  const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return straightKm * 1.4;
}

/** ~20 km/h en ville à Dakar → minutes = km / 20 * 60. */
export function estimateDuration(km: number): number {
  return (km / 20) * 60;
}

export function calculatePrice({
  km,
  minutes,
  parcelType,
  config,
}: {
  km: number;
  minutes: number;
  parcelType: ParcelType;
  config: PricingConfig;
}): PriceBreakdown {
  const distanceCost = km * config.price_per_km;
  const durationCost = minutes * config.price_per_min;
  const rawBase      = config.base_fare + distanceCost + durationCost;
  const flooredBase  = Math.max(rawBase, config.minimum_fare);
  const supplement   = (config as Record<string, number>)[`supp_${parcelType}`] ?? 0;
  // Arrondir à la centaine de francs supérieure pour des prix "propres"
  const total = Math.ceil((flooredBase + supplement) / 100) * 100;

  return {
    baseFare:     config.base_fare,
    distanceCost: Math.round(distanceCost),
    durationCost: Math.round(durationCost),
    supplement,
    total,
    km:      Math.round(km * 10) / 10,
    minutes: Math.round(minutes),
  };
}
