/**
 * recalculate-trust-score
 *
 * Recalcule le trust_score d'un livreur à partir de ses pénalités de monitoring
 * (30 derniers jours) et de son historique de livraisons réussies.
 * Suspend automatiquement si le score passe sous le seuil configuré.
 *
 * Appelée par monitor-trip après chaque anomalie, ou à la demande.
 * Fonctionne avec service_role : invisible côté client/livreur (RLS bypassed).
 *
 * Body JSON : { driver_id: string }
 * Réponse   : { driver_id, new_score, suspended }
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  let driverId: string;

  try {
    const body = await req.json();
    driverId = body.driver_id;
    if (!driverId) throw new Error();
  } catch {
    return Response.json(
      { error: "Body JSON invalide ou driver_id manquant" },
      { status: 400 },
    );
  }

  // service_role : bypasse RLS — opération purement back-end.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Seuil de suspension ──────────────────────────────────────────────────
  const { data: configRows } = await supabase
    .from("monitoring_config")
    .select("key, value")
    .eq("key", "seuil_suspension");

  const seuilSuspension = Number(
    (configRows as any[])?.find((r: any) => r.key === "seuil_suspension")?.value ?? 60,
  );

  // ── 2. Pénalités des 30 derniers jours ─────────────────────────────────────
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: penalties } = await supabase
    .from("monitoring_events")
    .select("penalty")
    .eq("driver_id", driverId)
    .gte("created_at", thirtyDaysAgo);

  const totalPenalty = ((penalties as any[]) ?? []).reduce(
    (sum: number, e: any) => sum + (e.penalty as number),
    0,
  );

  // ── 3. Bonus livraisons réussies – +1 par tranche de 10, plafond +10 ───────
  const { count: deliveryCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driverId)
    .eq("status", "livree")
    .eq("payment_status", "paye")
    .gte("updated_at", thirtyDaysAgo);

  const bonus = Math.min(Math.floor((deliveryCount ?? 0) / 10), 10);

  // ── 4. Score final clamped [0, 100] ────────────────────────────────────────
  const score = Math.min(100, Math.max(0, 100 - totalPenalty + bonus));

  await supabase
    .from("drivers")
    .update({ trust_score: score, last_score_update: new Date().toISOString() })
    .eq("id", driverId);

  // ── 5. Suspension automatique si score < seuil ─────────────────────────────
  let suspended = false;

  if (score < seuilSuspension) {
    const { data: driver } = await supabase
      .from("drivers")
      .select("status, profile_id")
      .eq("id", driverId)
      .single();

    if (driver && (driver as any).status !== "suspendu") {
      await supabase
        .from("drivers")
        .update({ status: "suspendu" })
        .eq("id", driverId);

      // Incident de traçabilité — status 'suspension_auto' (valeur enum existante).
      await supabase.from("incidents").insert({
        order_id: null,
        reported_by: (driver as any).profile_id,
        type: "suspicion",
        status: "suspension_auto",
        description: `Suspension automatique : score ${score} < seuil ${seuilSuspension}`,
      });

      suspended = true;
    }
  }

  return Response.json({ driver_id: driverId, new_score: score, suspended });
});
