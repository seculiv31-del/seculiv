// Edge Function "create-driver"
//
// Permet à un ADMIN de créer un compte livreur complet (auth + profil + fiche driver)
// sans jamais exposer la clé service_role à l'application mobile.
//
// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  // auth: "user" => le wrapper exige un JWT valide dans le header Authorization
  // (rejet automatique en 401 si absent/invalide, avant même d'exécuter ce code).
  // ctx.userClaims.id contient alors l'id de l'utilisateur AUTHENTIFIÉ qui appelle.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Méthode non autorisée." }, { status: 405 });
    }

    // ─────────────────────────────────────────────────────────────────────
    // SÉCURITÉ (1/2) — Vérifier que l'APPELANT est bien un admin.
    //
    // ctx.supabase est un client scopé RLS avec le JWT de l'appelant : la
    // policy "lire son profil ou admin" lui permet de lire SA PROPRE ligne
    // dans `profiles`. On vérifie son `role` AVANT toute opération privilégiée.
    // Sans ce contrôle, n'importe quel compte client connecté pourrait
    // appeler cette fonction et créer des comptes livreur arbitraires.
    // ─────────────────────────────────────────────────────────────────────
    const callerId = ctx.userClaims!.id;

    const { data: callerProfile, error: callerError } = await ctx.supabase
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (callerError || callerProfile?.role !== "admin") {
      return Response.json(
        { error: "Accès refusé : réservé aux administrateurs." },
        { status: 403 },
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lecture et validation du body
    // ─────────────────────────────────────────────────────────────────────
    let body: {
      full_name?: string;
      email?: string;
      phone?: string;
      password?: string;
      moto_plate?: string;
    };

    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const full_name = body.full_name?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim() || null;
    const password = body.password;
    const moto_plate = body.moto_plate?.trim();

    if (!full_name || !email || !password || !moto_plate) {
      return Response.json(
        { error: "Champs requis manquants : full_name, email, password, moto_plate." },
        { status: 400 },
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 },
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // SÉCURITÉ (2/2) — Opérations privilégiées via ctx.supabaseAdmin.
    //
    // ctx.supabaseAdmin utilise la clé service_role : elle bypass RLS et
    // permet `auth.admin.createUser`. Cette clé n'existe QUE dans
    // l'environnement de la Edge Function (injectée automatiquement par
    // Supabase) — elle ne transite jamais vers l'app mobile.
    // ─────────────────────────────────────────────────────────────────────
    const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    if (createError || !created?.user) {
      return Response.json(
        { error: createError?.message ?? "Création du compte impossible." },
        { status: 400 },
      );
    }

    const newUserId = created.user.id;

    // Le trigger `handle_new_user` vient de créer la ligne `profiles` avec
    // role = 'client' (valeur par défaut) : on la repasse en 'driver'.
    const { error: roleError } = await ctx.supabaseAdmin
      .from("profiles")
      .update({ role: "driver" })
      .eq("id", newUserId);

    if (roleError) {
      // Rollback : on ne laisse pas un compte auth orphelin sans rôle correct.
      await ctx.supabaseAdmin.auth.admin.deleteUser(newUserId);
      return Response.json({ error: "Échec de la mise à jour du rôle." }, { status: 500 });
    }

    // Création de la fiche livreur.
    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .insert({
        profile_id: newUserId,
        moto_plate,
        trust_score: 100,
        status: "hors_ligne",
        is_verified: true,
      })
      .select()
      .single();

    if (driverError) {
      await ctx.supabaseAdmin.auth.admin.deleteUser(newUserId);
      return Response.json(
        { error: "Échec de la création de la fiche livreur." },
        { status: 500 },
      );
    }

    return Response.json(
      {
        success: true,
        driver: {
          ...driver,
          email,
          full_name,
        },
      },
      { status: 201 },
    );
  }),
};
