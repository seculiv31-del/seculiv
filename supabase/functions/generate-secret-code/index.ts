// Edge Function "generate-secret-code"
// Génère un code à 4 chiffres pour une commande.
// Pour les commandes sensibles, deux appels sont attendus :
//   - code_type = 'expediteur'  → code connu de l'expéditeur (client)
//   - code_type = 'destinataire' → code à transmettre au destinataire
//
// Le code est retourné EN CLAIR une seule fois ; seul son SHA-256 est persisté.
// Empêche les doublons via la contrainte uq_secret_codes_order_code_type.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SR_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SR_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode(): string {
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") {
      return Response.json({ error: "Methode non autorisee." }, { status: 405, headers: CORS });
    }

    // ── Auth ────────────────────────────────────────────────────────────────────
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
    let body: { order_id?: string; code_type?: string };
    try { body = await req.json(); }
    catch { return Response.json({ error: "JSON invalide." }, { status: 400, headers: CORS }); }

    const { order_id, code_type = "expediteur" } = body;
    if (!order_id) {
      return Response.json({ error: "order_id requis." }, { status: 400, headers: CORS });
    }
    if (code_type !== "expediteur" && code_type !== "destinataire") {
      return Response.json(
        { error: "code_type invalide. Valeurs : 'expediteur' ou 'destinataire'." },
        { status: 400, headers: CORS },
      );
    }

    // ── Vérification commande ───────────────────────────────────────────────────
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, client_id, is_sensitive")
      .eq("id", order_id)
      .single();

    if (!order) {
      return Response.json({ error: "Commande introuvable." }, { status: 404, headers: CORS });
    }
    if (order.client_id !== user.id) {
      return Response.json({ error: "Acces refuse." }, { status: 403, headers: CORS });
    }

    // Empêche la génération d'un code destinataire pour une commande non-sensible.
    if (code_type === "destinataire" && !order.is_sensitive) {
      return Response.json(
        { error: "Code destinataire uniquement pour les commandes sensibles." },
        { status: 422, headers: CORS },
      );
    }

    // ── Anti-doublon (order_id, code_type) ─────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from("secret_codes")
      .select("id")
      .eq("order_id", order_id)
      .eq("code_type", code_type)
      .maybeSingle();

    if (existing) {
      return Response.json(
        { error: `Un code '${code_type}' existe deja pour cette commande.` },
        { status: 409, headers: CORS },
      );
    }

    // ── Génération ──────────────────────────────────────────────────────────────
    const code = generateCode();
    const codeHash = await sha256Hex(code);

    const { error: insertErr } = await supabaseAdmin
      .from("secret_codes")
      .insert({ order_id, code_hash: codeHash, code_type });

    if (insertErr) {
      return Response.json(
        { error: "Erreur creation du code : " + insertErr.message },
        { status: 500, headers: CORS },
      );
    }

    // Le code en clair est retourné une seule fois — jamais re-consultable côté serveur.
    return Response.json({ code }, { headers: CORS });
  },
};
