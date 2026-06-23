/** Distance en kilomètres entre deux coordonnées GPS (formule Haversine). */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Somme des distances entre points successifs d'un tracé GPS. */
export function totalDistance(
  points: { lat: number; lng: number }[],
): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return dist;
}
