/**
 * monitor-trip  (déclenchée par cron toutes les 2 minutes)
 *
 * Analyse les courses actives et détecte 3 types d'anomalies par règles :
 *   - arret_prolonge  : immobile > arret_minutes  (penalty 2,  severity faible)
 *   - coupure_gps     : écart entre points > coupure_minutes (penalty 10, severity elevee)
 *   - detour          : distance parcourue > vol-oiseau × 1.4 + detour_km (penalty 3, faible)
 *
 * NOTE détour : pickup/dropoff ne contenant pas encore de lat/lng, on utilise
 * le 1er et le dernier point GPS comme proxy de l'origine et de la destination.
 *
 * Après chaque anomalie, appelle recalculate-trust-score pour le livreur concerné.
 * Tourne avec service_role côté serveur — invisible pour client/livreur.
 *
 * Réponse : { courses_analysees, anomalies_detectees }
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Haversine (inline pour éviter les imports cross-function en prod) ─────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function totalDistance(points: { lat: number; lng: number }[]): number {
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return dist;
}

// ── Entrée principale ─────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  // service_role : bypasse RLS — opération purement back-end.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Lire les seuils depuis monitoring_config ───────────────────────────
  const { data: configRows } = await supabase
    .from("monitoring_config")
    .select("key, value");

  const cfg: Record<string, number> = {};
  for (const row of (configRows as any[]) ?? []) cfg[row.key] = Number(row.value);

  const detourKm       = cfg["detour_km"]        ?? 2;
  const arretMinutes   = cfg["arret_minutes"]     ?? 10;
  const coupureMinutes = cfg["coupure_minutes"]   ?? 3;

  // ── 2. Commandes actives ──────────────────────────────────────────────────
  const { data: orders } = await supabase
    .from("orders")
    .select("id, driver_id")
    .in("status", ["enlevement", "en_transport", "arrivee"]);

  const now           = Date.now();
  const oneHourAgo    = new Date(now - 60 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

  let coursesAnalysees  = 0;
  let anomaliesDetectees = 0;

  // ── 3. Analyser chaque course ─────────────────────────────────────────────
  for (const order of (orders as any[]) ?? []) {
    coursesAnalysees++;

    const { data: points } = await supabase
      .from("gps_tracking")
      .select("lat, lng, recorded_at")
      .eq("order_id", order.id)
      .gte("recorded_at", oneHourAgo)
      .order("recorded_at", { ascending: true });

    if (!points || points.length < 2) continue;

    const first = points[0] as { lat: number; lng: number; recorded_at: string };
    const last  = points[points.length - 1] as { lat: number; lng: number; recorded_at: string };
    const prev  = points[points.length - 2] as { lat: number; lng: number; recorded_at: string };

    // Vérifie si une anomalie du même type existe déjà dans les 10 dernières min.
    async function isDuplicate(type: string): Promise<boolean> {
      const { count } = await supabase
        .from("monitoring_events")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id)
        .eq("type", type)
        .gte("created_at", tenMinutesAgo);
      return (count ?? 0) > 0;
    }

    async function insertAnomaly(params: {
      type: string;
      severity: string;
      penalty: number;
      detail: string;
    }): Promise<boolean> {
      if (await isDuplicate(params.type)) return false;
      await supabase.from("monitoring_events").insert({
        order_id:  order.id,
        driver_id: order.driver_id,
        type:      params.type,
        severity:  params.severity,
        penalty:   params.penalty,
        detail:    params.detail,
      });
      anomaliesDetectees++;
      return true;
    }

    // ── a) ARRÊT PROLONGÉ ─────────────────────────────────────────────────
    // Remonte la trace depuis la fin pour trouver le premier point encore mobile.
    let immobileFrom = points.length - 1;
    for (let i = points.length - 2; i >= 0; i--) {
      const p = points[i] as { lat: number; lng: number; recorded_at: string };
      if (haversine(p.lat, p.lng, last.lat, last.lng) < 0.05) {
        immobileFrom = i; // < 50 m → toujours immobile
      } else {
        break;
      }
    }
    const immobileMs =
      new Date(last.recorded_at).getTime() -
      new Date((points[immobileFrom] as any).recorded_at).getTime();

    if (immobileMs > arretMinutes * 60_000) {
      const mins = Math.round(immobileMs / 60_000);
      await insertAnomaly({
        type:     "arret_prolonge",
        severity: "faible",
        penalty:  2,
        detail:   `Immobile depuis ${mins} min (seuil : ${arretMinutes} min)`,
      });
    }

    // ── b) COUPURE GPS ────────────────────────────────────────────────────
    const ecartMs =
      new Date(last.recorded_at).getTime() - new Date(prev.recorded_at).getTime();

    if (ecartMs > coupureMinutes * 60_000) {
      const mins = Math.round(ecartMs / 60_000);
      const inserted = await insertAnomaly({
        type:     "coupure_gps",
        severity: "elevee",
        penalty:  10,
        detail:   `Coupure GPS de ${mins} min (seuil : ${coupureMinutes} min)`,
      });
      // Un incident 'suspicion' accompagne chaque coupure grave (best-effort).
      if (inserted) {
        // Récupère le profile_id du livreur pour satisfaire la FK reported_by.
        const { data: driverRow } = await supabase
          .from("drivers")
          .select("profile_id")
          .eq("id", order.driver_id)
          .single();
        if (driverRow) {
          await supabase.from("incidents").insert({
            order_id:    order.id,
            reported_by: (driverRow as any).profile_id,
            type:        "suspicion",
            status:      "ouvert",
            description: `Coupure GPS de ${mins} min détectée automatiquement`,
          });
        }
      }
    }

    // ── c) DÉTOUR ─────────────────────────────────────────────────────────
    // Proxy : 1er point GPS ≈ enlèvement, dernier point GPS ≈ position actuelle.
    // TODO : utiliser les coordonnées réelles de pickup/dropoff quand elles
    //        seront ajoutées aux colonnes JSONB de orders.
    const parcouru = totalDistance(points as { lat: number; lng: number }[]);
    const volOiseau = haversine(first.lat, first.lng, last.lat, last.lng);
    const attendu = volOiseau * 1.4; // facteur route urbaine
    const ecartKm = parcouru - attendu;

    if (ecartKm > detourKm && parcouru > 0.5) {
      // On n'alerte que si le trajet dépasse 500m (évite les faux positifs au démarrage).
      await insertAnomaly({
        type:     "detour",
        severity: "faible",
        penalty:  3,
        detail:   `Écart de ${ecartKm.toFixed(1)} km (parcouru : ${parcouru.toFixed(1)} km, attendu : ${attendu.toFixed(1)} km)`,
      });
    }

    // ── Recalcul du score après anomalie ─────────────────────────────────
    if (order.driver_id && anomaliesDetectees > 0) {
      const scoreUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/recalculate-trust-score`;
      // Fire-and-forget : on ne bloque pas l'analyse si le recalcul échoue.
      fetch(scoreUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ driver_id: order.driver_id }),
      }).catch(() => {});
    }
  }

  return Response.json({
    courses_analysees:  coursesAnalysees,
    anomalies_detectees: anomaliesDetectees,
  });
});
