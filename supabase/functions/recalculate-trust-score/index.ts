/**
 * recalculate-trust-score
 *
 * Base : 100 points.
 * Pénalités monitoring des 30 derniers jours (−).
 * Bonus livraisons réussies : +1 par tranche de 10, plafond +10.
 * Bonus/malus notes clients : (moyenne − 3) × 5, clamped [−10, +10].
 *   → 1★ : −10 · 2★ : −5 · 3★ : 0 · 4★ : +5 · 5★ : +10
 * Suspension automatique si score < seuil configuré.
 *
 * Body JSON : { driver_id: string }
 * Réponse   : { driver_id, new_score, suspended }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    let driverId: string;
    try {
      const body = await req.json();
      driverId = body.driver_id;
      if (!driverId) throw new Error();
    } catch {
      return Response.json({ error: "driver_id manquant." }, { status: 400, headers: CORS });
    }

    // ── 1. Seuil de suspension ────────────────────────────────────────────────
    const { data: configRows } = await supabase
      .from("monitoring_config")
      .select("key, value")
      .eq("key", "seuil_suspension");

    const seuilSuspension = Number(
      (configRows as { key: string; value: number }[] ?? [])
        .find((r) => r.key === "seuil_suspension")?.value ?? 60,
    );

    // ── 2. Pénalités monitoring (30 derniers jours) ───────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: penalties } = await supabase
      .from("monitoring_events")
      .select("penalty")
      .eq("driver_id", driverId)
      .gte("created_at", thirtyDaysAgo);

    const totalPenalty = (penalties as { penalty: number }[] ?? [])
      .reduce((s, e) => s + e.penalty, 0);

    // ── 3. Livraisons réussies (30 derniers jours) – bonus + source des notes ─
    const { data: livreeOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("driver_id", driverId)
      .eq("status", "livree")
      .eq("payment_status", "paye")
      .gte("updated_at", thirtyDaysAgo);

    const livreeIds = (livreeOrders as { id: string }[] ?? []).map((o) => o.id);
    const deliveryBonus = Math.min(Math.floor(livreeIds.length / 10), 10);

    // ── 4. Bonus/malus notes clients ──────────────────────────────────────────
    let ratingBonus = 0;
    if (livreeIds.length > 0) {
      const { data: ratings } = await supabase
        .from("delivery_ratings")
        .select("score")
        .in("order_id", livreeIds);

      const scores = (ratings as { score: number }[] ?? []).map((r) => r.score);
      if (scores.length > 0) {
        const avgRating = scores.reduce((s, v) => s + v, 0) / scores.length;
        ratingBonus = Math.round(Math.min(10, Math.max(-10, (avgRating - 3) * 5)));
      }
    }

    // ── 5. Score final [0, 100] ───────────────────────────────────────────────
    const score = Math.min(100, Math.max(0, 100 - totalPenalty + deliveryBonus + ratingBonus));

    await supabase
      .from("drivers")
      .update({ trust_score: score, last_score_update: new Date().toISOString() })
      .eq("id", driverId);

    // ── 6. Suspension automatique ─────────────────────────────────────────────
    let suspended = false;
    if (score < seuilSuspension) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("status, profile_id")
        .eq("id", driverId)
        .single();

      if (driver && (driver as { status: string }).status !== "suspendu") {
        await supabase.from("drivers").update({ status: "suspendu" }).eq("id", driverId);
        await supabase.from("incidents").insert({
          order_id:    null,
          reported_by: (driver as { profile_id: string }).profile_id,
          type:        "suspicion",
          status:      "suspension_auto",
          description: `Suspension automatique : score ${score} < seuil ${seuilSuspension}`,
        });
        suspended = true;
      }
    }

    return Response.json({ driver_id: driverId, new_score: score, suspended }, { headers: CORS });
  },
};
