// Edge Function "send-push"
// Envoie une notification push via l'API Expo Push Service.
// Accepte : user JWT (appels depuis l'app) ou service_role key (appels inter-fonctions).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SR_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SR_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PushBody = {
  profile_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string; // 'delivery' | 'proximity' | 'certificate' | 'promo'
};

export default {
  fetch: async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") {
      return Response.json({ error: "Methode non autorisee." }, { status: 405, headers: CORS });
    }

    // ── Auth : user JWT ou service_role key ───────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) {
      return Response.json({ error: "Non autorise." }, { status: 401, headers: CORS });
    }
    const isSR = bearer === SR_KEY;
    if (!isSR) {
      const { error: authErr } = await supabaseAdmin.auth.getUser(bearer);
      if (authErr) {
        return Response.json({ error: "Non autorise." }, { status: 401, headers: CORS });
      }
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    let pushBody: PushBody;
    try { pushBody = await req.json(); }
    catch { return Response.json({ error: "JSON invalide." }, { status: 400, headers: CORS }); }

    const { profile_id, title, body, data, category } = pushBody;
    if (!profile_id || !title || !body) {
      return Response.json(
        { error: "profile_id, title et body sont requis." },
        { status: 400, headers: CORS }
      );
    }

    // ── Préférences de notification ───────────────────────────────────────────
    if (category) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("notif_prefs")
        .eq("id", profile_id)
        .single();

      const prefs = prof?.notif_prefs as Record<string, boolean> | null;
      if (prefs && prefs[category] === false) {
        return Response.json(
          { skipped: true, reason: "category_disabled" },
          { headers: CORS }
        );
      }
    }

    // ── Récupère les tokens ───────────────────────────────────────────────────
    const { data: tokens } = await supabaseAdmin
      .from("push_tokens")
      .select("id, token")
      .eq("profile_id", profile_id);

    if (!tokens || tokens.length === 0) {
      return Response.json({ sent: 0, reason: "no_tokens" }, { headers: CORS });
    }

    // ── Envoi Expo Push API ───────────────────────────────────────────────────
    const messages = (tokens as { id: string; token: string }[]).map((t) => ({
      to:        t.token,
      title,
      body,
      data:      data ?? {},
      sound:     "default",
      priority:  "high",
      channelId: "default",
    }));

    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    type ExpoTicket = { status: string; details?: { error?: string } };
    const expoResult = (await expoRes.json()) as { data?: ExpoTicket[] };

    // ── Supprime les tokens invalides ─────────────────────────────────────────
    if (expoResult.data) {
      const INVALID_ERRORS = ["DeviceNotRegistered", "InvalidCredentials"];
      const toDelete = (tokens as { id: string; token: string }[])
        .filter((_, i) => {
          const ticket = expoResult.data![i];
          return ticket?.status === "error" &&
            INVALID_ERRORS.includes(ticket.details?.error ?? "");
        })
        .map((t) => t.id);

      if (toDelete.length > 0) {
        await supabaseAdmin.from("push_tokens").delete().in("id", toDelete);
      }
    }

    return Response.json({ sent: messages.length }, { headers: CORS });
  },
};
