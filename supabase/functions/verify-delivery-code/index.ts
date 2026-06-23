// Edge Function "verify-delivery-code"
// Vérifie un code de livraison selon son type (expediteur ou destinataire).
//
// RÈGLE SENSIBLE : pour une commande is_sensitive=true, la propriété
// `ready_to_deliver` n'est true que si LES DEUX codes ont validated_at renseigné.
// C'est le client (driver app) qui déclenche le passage à 'livree' après
// avoir reçu ready_to_deliver=true (après la vérification d'identité).
//
// Anti-bruteforce : max 5 tentatives par code ; au-delà, refus définitif.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SR_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SR_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") {
      return Response.json({ error: "Methode non autorisee." }, { status: 405, headers: CORS });
    }

    // ── Auth (livreur JWT) ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) {
      return Response.json({ error: "Non autorise." }, { status: 401, headers: CORS });
    }
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(bearer);
    if (authErr || !user) {
      return Response.json({ error: "Non autorise." }, { status: 401, headers: CORS });
    }

    // ── Body ────────────────────────────────────────────────────────────────────
    let body: { order_id?: string; code?: string; code_type?: string };
    try { body = await req.json(); }
    catch { return Response.json({ error: "JSON invalide." }, { status: 400, headers: CORS }); }

    const { order_id, code, code_type = "expediteur" } = body;
    if (!order_id || !code) {
      return Response.json({ error: "order_id et code requis." }, { status: 400, headers: CORS });
    }
    if (code_type !== "expediteur" && code_type !== "destinataire") {
      return Response.json({ error: "code_type invalide." }, { status: 400, headers: CORS });
    }

    // ── Commande ────────────────────────────────────────────────────────────────
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, driver_id, is_sensitive, status")
      .eq("id", order_id)
      .single();

    if (!order) {
      return Response.json({ error: "Commande introuvable." }, { status: 404, headers: CORS });
    }
    if (order.status !== "arrivee") {
      return Response.json(
        { error: "La verification est possible uniquement au statut arrivee." },
        { status: 422, headers: CORS },
      );
    }

    // ── Récupère le code attendu ────────────────────────────────────────────────
    const { data: secretCode } = await supabaseAdmin
      .from("secret_codes")
      .select("id, code_hash, validated_at, attempts")
      .eq("order_id", order_id)
      .eq("code_type", code_type)
      .maybeSingle();

    if (!secretCode) {
      return Response.json(
        { error: `Aucun code '${code_type}' trouve pour cette commande.` },
        { status: 404, headers: CORS },
      );
    }

    // Déjà validé
    if (secretCode.validated_at) {
      return Response.json({ valid: true, already_validated: true }, { headers: CORS });
    }

    // Trop de tentatives
    if (secretCode.attempts >= MAX_ATTEMPTS) {
      return Response.json(
        { valid: false, error: "Trop de tentatives incorrectes. Ce code est bloqué." },
        { status: 429, headers: CORS },
      );
    }

    // ── Vérification du hash ────────────────────────────────────────────────────
    const submitted = await sha256Hex(code.trim());
    const isValid = submitted === secretCode.code_hash;

    if (!isValid) {
      // Incrémente le compteur de tentatives.
      await supabaseAdmin
        .from("secret_codes")
        .update({ attempts: secretCode.attempts + 1 })
        .eq("id", secretCode.id);

      const remaining = MAX_ATTEMPTS - secretCode.attempts - 1;
      return Response.json(
        {
          valid: false,
          error: remaining > 0
            ? `Code incorrect. ${remaining} tentative(s) restante(s).`
            : "Code incorrect. Ce code est maintenant bloqué.",
        },
        { headers: CORS },
      );
    }

    // ── Code correct : marque validated_at ─────────────────────────────────────
    await supabaseAdmin
      .from("secret_codes")
      .update({ validated_at: new Date().toISOString(), attempts: 0 })
      .eq("id", secretCode.id);

    // ── Vérification "prêt à livrer" (sensible = DEUX codes requis) ────────────
    let readyToDeliver = true;
    if (order.is_sensitive) {
      // Compte combien de codes ont validated_at (incluant celui qu'on vient de valider).
      const { data: allCodes } = await supabaseAdmin
        .from("secret_codes")
        .select("code_type, validated_at")
        .eq("order_id", order_id);

      const validatedTypes = (allCodes ?? []).filter(
        (c) => c.code_type === code_type ? true : !!c.validated_at,
      ).length;

      // ready_to_deliver uniquement quand les 2 types sont validés
      readyToDeliver = validatedTypes >= 2;
    }

    return Response.json({ valid: true, ready_to_deliver: readyToDeliver }, { headers: CORS });
  },
};
