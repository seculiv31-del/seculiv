// Edge Function "admin-view-id"
// Permet à un admin de consulter la photo de pièce d'identité d'une livraison sensible.
//
// SÉCURITÉ DONNÉE PERSONNELLE :
//   - Accès exclusivement réservé aux profils role='admin'.
//   - La signed URL est éphémère (5 minutes). Jamais exposée au livreur ni au client.
//   - Chaque accès est journalisé dans audit_log (admin_id, order_id, timestamp).
//
// TODO : Politique de conservation/suppression des pièces d'identité à définir
//        avant lancement (conformité CDP Sénégal — Commission des Données Personnelles).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SR_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SR_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // ── Vérification rôle admin ─────────────────────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return Response.json(
        { error: "Acces reserve aux administrateurs." },
        { status: 403, headers: CORS },
      );
    }

    // ── Body ────────────────────────────────────────────────────────────────────
    let body: { order_id?: string };
    try { body = await req.json(); }
    catch { return Response.json({ error: "JSON invalide." }, { status: 400, headers: CORS }); }

    const { order_id } = body;
    if (!order_id) {
      return Response.json({ error: "order_id requis." }, { status: 400, headers: CORS });
    }

    // ── Récupère la commande sensible ───────────────────────────────────────────
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, is_sensitive, id_photo_url, id_verified_at")
      .eq("id", order_id)
      .single();

    if (!order) {
      return Response.json({ error: "Commande introuvable." }, { status: 404, headers: CORS });
    }
    if (!order.is_sensitive) {
      return Response.json(
        { error: "Cette commande n'est pas une livraison sensible." },
        { status: 422, headers: CORS },
      );
    }
    if (!order.id_photo_url) {
      return Response.json(
        { error: "Aucune photo de piece d'identite pour cette commande." },
        { status: 404, headers: CORS },
      );
    }

    // ── Génère une signed URL courte (5 min = 300 s) ───────────────────────────
    // La photo est stockée dans le bucket privé "id-verifications".
    // Le livreur n'a aucune policy SELECT → ne peut JAMAIS accéder à ce fichier.
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from("id-verifications")
      .createSignedUrl(order.id_photo_url, 300);

    if (signedErr || !signedData?.signedUrl) {
      return Response.json(
        { error: "Impossible de generer l'URL : " + (signedErr?.message ?? "inconnu") },
        { status: 500, headers: CORS },
      );
    }

    // ── Journalise l'accès dans audit_log (traçabilité obligatoire) ─────────────
    await supabaseAdmin.from("audit_log").insert({
      admin_id:   user.id,
      action:     "view_id_photo",
      target:     order_id,
    });

    return Response.json(
      {
        signed_url:      signedData.signedUrl,
        expires_in_sec:  300,
        id_verified_at:  order.id_verified_at,
      },
      { headers: CORS },
    );
  },
};
