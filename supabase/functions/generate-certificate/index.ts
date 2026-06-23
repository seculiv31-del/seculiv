// Edge Function "generate-certificate"
// Génère le certificat PDF de livraison SECULIV, calcule son hash SHA-256,
// l'upload dans le bucket "certificates" et enregistre en base.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
// @ts-ignore — bibliothèque pure-JS sans types Deno
import qrcode from "qrcode-generator";

// ─── Couleurs SECULIV ────────────────────────────────────────────────────────
const NAVY  = rgb(0.106, 0.165, 0.290); // #1B2A4A
const GREEN = rgb(0.263, 0.690, 0.361); // #43B05C
const GRAY  = rgb(0.482, 0.529, 0.612); // #7B879C
const LGRAY = rgb(0.961, 0.969, 0.980); // #F5F7FA
const WHITE = rgb(1, 1, 1);
const DARK  = rgb(0.176, 0.216, 0.282); // #2D3748

// ─── Dimensions A4 ───────────────────────────────────────────────────────────
const PAGE_W    = 595;
const PAGE_H    = 842;
const MARGIN    = 36;
const CONTENT_W = PAGE_W - MARGIN * 2; // 523
const HEADER_H  = 88;

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Utilitaires texte ───────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Dakar",
  });
}

// Tronque et remplace les caractères hors WinAnsi (U+0080-U+009F exceptés).
// StandardFonts utilisent WinAnsi (cp1252) : é è à etc. sont supportés,
// mais U+2713 (✓) ne l'est pas → on le supprime.
function safe(s: string | null | undefined, max = 70): string {
  if (!s) return "N/A";
  // retire les caractères > U+00FF non présents dans cp1252
  const cleaned = s.replace(/[^\x00-\xFF]/g, "").replace(/[\x80-\x9F]/g, "");
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "..." : cleaned;
}

// ─── Dessin logo (pin + cadenas géométriques) ────────────────────────────────
function drawLogo(page: PDFPage, x: number, y: number) {
  // Cercle extérieur du pin (blanc)
  page.drawEllipse({ x: x + 18, y: y + 54, xScale: 13, yScale: 13, color: WHITE });
  // Disque intérieur (vert — l'oeil du pin)
  page.drawEllipse({ x: x + 18, y: y + 54, xScale: 8,  yScale: 8,  color: GREEN });
  // Tige du pin
  page.drawRectangle({ x: x + 15, y: y + 30, width: 6, height: 24, color: WHITE });
  // Pointe du pin
  page.drawEllipse({ x: x + 18, y: y + 28, xScale: 4, yScale: 5, color: WHITE });

  // Corps du cadenas (rectangle vert)
  page.drawRectangle({ x: x + 28, y: y + 34, width: 20, height: 15, color: GREEN });
  // Anse du cadenas (deux piliers + barre horizontale)
  page.drawRectangle({ x: x + 30, y: y + 49, width: 4,  height: 9,  color: GREEN });
  page.drawRectangle({ x: x + 40, y: y + 49, width: 4,  height: 9,  color: GREEN });
  page.drawRectangle({ x: x + 30, y: y + 56, width: 14, height: 4,  color: GREEN });
  // Trou de serrure (petit cercle navy)
  page.drawEllipse({ x: x + 38, y: y + 41, xScale: 3, yScale: 3, color: NAVY });
}

// ─── QR code (matrice de rectangles) ─────────────────────────────────────────
// Paramètre size = côté en points du carré total.
// Le hash garantit l'authenticité : quiconque connaît les données peut
// recalculer le hash et comparer avec celui du QR / du certificat.
function drawQrCode(page: PDFPage, data: string, x: number, y: number, size = 80) {
  const qr = qrcode(0, "M"); // 0 = version auto, M = ~15 % de correction d'erreur
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cell  = size / count;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        // pdf-lib : y=0 en bas → inverser les lignes
        page.drawRectangle({
          x: x + col * cell,
          y: y + (count - 1 - row) * cell,
          width: cell, height: cell,
          color: DARK,
        });
      }
    }
  }
}

// ─── En-tête de section ───────────────────────────────────────────────────────
function drawSection(
  page: PDFPage, font: PDFFont,
  label: string, x: number, y: number, w: number,
): number {
  page.drawRectangle({ x, y: y - 20, width: w, height: 22, color: LGRAY });
  page.drawRectangle({ x, y: y - 20, width: 4,  height: 22, color: GREEN });
  page.drawText(label.toUpperCase(), { x: x + 10, y: y - 14, size: 8, font, color: NAVY });
  return y - 30; // curseur sous le header
}

// ─── Champ label : valeur ─────────────────────────────────────────────────────
function drawField(
  page: PDFPage, lf: PDFFont, vf: PDFFont,
  label: string, value: string,
  x: number, y: number, lw = 130,
): number {
  page.drawText(safe(label), { x,      y, size: 8, font: lf, color: GRAY });
  page.drawText(safe(value), { x: x + lw, y, size: 8, font: vf, color: DARK });
  return y - 14;
}

// ─── Téléchargement photo ─────────────────────────────────────────────────────
async function fetchPhoto(url: string, srKey: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${srKey}` } });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // CORS preflight
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") {
      return Response.json({ error: "Methode non autorisee." }, { status: 405, headers: CORS });
    }

    // ── 1. Body ──────────────────────────────────────────────────────────────
    let body: { order_id?: string };
    try { body = await req.json(); }
    catch { return Response.json({ error: "JSON invalide." }, { status: 400, headers: CORS }); }

    const { order_id } = body;
    if (!order_id?.match(/^[0-9a-f-]{36}$/i)) {
      return Response.json({ error: "order_id UUID invalide." }, { status: 400, headers: CORS });
    }

    // ── 2. Profil appelant ────────────────────────────────────────────────────
    const callerId = ctx.userClaims!.id;
    const { data: callerProfile } = await ctx.supabase
      .from("profiles").select("role").eq("id", callerId).single();
    const isAdmin = callerProfile?.role === "admin";

    // ── 3. Commande ───────────────────────────────────────────────────────────
    const { data: order, error: orderErr } = await ctx.supabaseAdmin
      .from("orders")
      .select(
        "id, client_id, driver_id, status, " +
        "pickup_address, dropoff_address, " +
        "parcel_type, protection_level, price_fcfa, " +
        "payment_method, payment_status, " +
        "photo_before_url, photo_after_url, " +
        "signature_url, signed_at, signed_by_name, " +
        "is_sensitive, expected_id_type, expected_id_name, id_verified_at"
      )
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return Response.json({ error: "Commande introuvable." }, { status: 404, headers: CORS });
    }

    // ── 4. Autorisation ───────────────────────────────────────────────────────
    if (!isAdmin && order.client_id !== callerId) {
      return Response.json({ error: "Acces refuse." }, { status: 403, headers: CORS });
    }
    if (order.status !== "livree") {
      return Response.json(
        { error: `Livraison non terminee — statut actuel : ${order.status}` },
        { status: 422, headers: CORS },
      );
    }

    // ── 5. Certificat existant → réponse immédiate (pas de doublon) ───────────
    const { data: existing } = await ctx.supabaseAdmin
      .from("certificates").select("id, pdf_path").eq("order_id", order_id).maybeSingle();
    if (existing) {
      return Response.json(
        { success: true, certificate_id: existing.id, pdf_path: existing.pdf_path, cached: true },
        { headers: CORS },
      );
    }

    // ── 6. Données complémentaires ────────────────────────────────────────────
    const [clientRes, scRes] = await Promise.all([
      ctx.supabaseAdmin.from("profiles").select("full_name, phone").eq("id", order.client_id).single(),
      // Récupère tous les codes (sensible = 2 codes ; standard = 1)
      ctx.supabaseAdmin.from("secret_codes").select("code_type, validated_at").eq("order_id", order_id),
    ]);
    const clientProfile      = clientRes.data;
    const secretCodes        = scRes.data ?? [];
    const expCode            = secretCodes.find((c) => c.code_type === "expediteur");
    const destCode           = secretCodes.find((c) => c.code_type === "destinataire");
    // Pour la section "Intervenants" : date de validation du code expéditeur (ou premier disponible).
    const validatedAt        = expCode?.validated_at ?? secretCodes[0]?.validated_at ?? null;
    // Double validation : les deux codes ont validated_at (uniquement pour les commandes sensibles).
    const bothCodesValidated = !!expCode?.validated_at && !!destCode?.validated_at;

    let driverName       = "N/A";
    let driverTrustScore = "N/A";
    if (order.driver_id) {
      const [dpRes, drRes] = await Promise.all([
        ctx.supabaseAdmin.from("profiles").select("full_name").eq("id", order.driver_id).single(),
        ctx.supabaseAdmin.from("drivers").select("trust_score").eq("profile_id", order.driver_id).maybeSingle(),
      ]);
      driverName       = dpRes.data?.full_name ?? "N/A";
      driverTrustScore = drRes.data?.trust_score != null ? String(drRes.data.trust_score) : "N/A";
    }

    const pickup  = (order.pickup_address  as Record<string, string>) ?? {};
    const dropoff = (order.dropoff_address as Record<string, string>) ?? {};
    const ref     = `SLV-${order.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    const INSURANCE: Record<string, string> = {
      basic:    "Aucune assurance",
      standard: "Assurance standard",
      premium:  "Assurance premium (vol + casse)",
    };
    const insurance = INSURANCE[order.protection_level] ?? order.protection_level ?? "N/A";

    // ── 7. Hash SHA-256 des données canoniques ────────────────────────────────
    // Le hash engage les champs métier immuables de la livraison.
    // Toute falsification du PDF serait détectée en recalculant ce hash
    // à partir des données brutes stockées en base.
    const certData = {
      order_id,
      ref,
      client_id:        order.client_id,
      driver_id:        order.driver_id,
      validated_at:     validatedAt,
      pickup_address:   pickup,
      dropoff_address:  dropoff,
      parcel_type:      order.parcel_type,
      protection_level: order.protection_level,
      price_fcfa:       order.price_fcfa,
      payment_method:   order.payment_method,
      payment_status:   order.payment_status,
      is_sensitive:     (order as any).is_sensitive ?? false,
    };
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(certData)),
    );
    const docHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ID du certificat généré avant le PDF pour l'encoder dans le QR
    const certId = crypto.randomUUID();

    // ── 8. Génération PDF ─────────────────────────────────────────────────────
    const doc  = await PDFDocument.create();
    doc.setTitle(`Certificat de livraison ${ref}`);
    doc.setAuthor("SECULIV");
    doc.setCreator("SECULIV Platform v1");

    const page    = doc.addPage([PAGE_W, PAGE_H]);
    const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
    const regular = await doc.embedFont(StandardFonts.Helvetica);

    // ── En-tête navy ──────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY });

    drawLogo(page, 18, PAGE_H - HEADER_H + 12);

    // Wordmark (le point median U+00B7 est dans WinAnsi)
    page.drawText("SECUL·IV", { x: 80, y: PAGE_H - 36, size: 22, font: bold, color: WHITE });
    page.drawText("LA SÉCURITÉ N'EST PAS UNE OPTION", {
      x: 80, y: PAGE_H - 52, size: 7.5, font: regular, color: GREEN,
    });
    page.drawText("Certificat de livraison", {
      x: MARGIN + 90, y: PAGE_H - 76, size: 12, font: bold, color: WHITE,
    });

    // Badge "VERIFIE" (dessin d'une coche géométrique + texte)
    const BX = PAGE_W - MARGIN - 76;
    const BY = PAGE_H - 68;
    page.drawRectangle({ x: BX, y: BY, width: 76, height: 22, color: GREEN });
    // Coche (deux segments) — pas de caractère Unicode check dans cp1252
    page.drawLine({ start: { x: BX + 8,  y: BY + 8  }, end: { x: BX + 13, y: BY + 4  }, thickness: 1.5, color: WHITE });
    page.drawLine({ start: { x: BX + 13, y: BY + 4  }, end: { x: BX + 22, y: BY + 16 }, thickness: 1.5, color: WHITE });
    page.drawText("VERIFIE", { x: BX + 25, y: BY + 8, size: 9, font: bold, color: WHITE });

    // ── Corps — curseur part sous l'en-tête ───────────────────────────────────
    let cy = PAGE_H - HEADER_H - 18;

    // ─────────── Section 1 : LIVRAISON ────────────────────────────────────────
    cy = drawSection(page, bold, "Livraison", MARGIN, cy, CONTENT_W);
    cy = drawField(page, bold, regular, "Référence :",       ref,                                                   MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Validation :",                fmt(validatedAt),                                      MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Départ :",               pickup.address  ?? pickup.label  ?? JSON.stringify(pickup),  MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Arrivée :",              dropoff.address ?? dropoff.label ?? JSON.stringify(dropoff), MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Type de colis :",             order.parcel_type      ?? "N/A",                       MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Niveau de protection :",      order.protection_level ?? "N/A",                       MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Assurance :",                 insurance,                                             MARGIN + 10, cy);
    cy -= 10;

    // ─────────── Section 2 : INTERVENANTS ─────────────────────────────────────
    cy = drawSection(page, bold, "Intervenants", MARGIN, cy, CONTENT_W);
    cy = drawField(page, bold, regular, "Expéditeur :",           clientProfile?.full_name ?? "N/A",                     MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Tél. expéditeur :", clientProfile?.phone     ?? "N/A",                     MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Destinataire :",              dropoff.name ?? dropoff.contact ?? "N/A",              MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Livreur :",                   driverName,                                            MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Score de confiance :",        `${driverTrustScore}/100`,                             MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Code validé :",          validatedAt ? `Oui — ${fmt(validatedAt)}` : "N/A",     MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Montant :",                   `${order.price_fcfa?.toLocaleString("fr-FR") ?? "N/A"} FCFA`, MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Mode de paiement :",          order.payment_method ?? "N/A",                         MARGIN + 10, cy);
    cy = drawField(page, bold, regular, "Statut paiement :",           order.payment_status ?? "N/A",                         MARGIN + 10, cy);
    cy -= 10;

    // ─────────── Section 3 : PREUVES PHOTOS ───────────────────────────────────
    const SR_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const PHOTO_H  = 100;
    const PHOTO_W  = (CONTENT_W - 20) / 2; // ~251

    cy = drawSection(page, bold, "Preuves photographiques", MARGIN, cy, CONTENT_W);
    page.drawText("Photo avant livraison",  { x: MARGIN + 10,               y: cy, size: 7.5, font: bold, color: GRAY });
    page.drawText("Photo après livraison", { x: MARGIN + 10 + PHOTO_W + 10, y: cy, size: 7.5, font: bold, color: GRAY });
    cy -= 6;

    const photoTopY = cy;
    const photoY    = photoTopY - PHOTO_H;

    // Cadres
    for (const px of [MARGIN + 10, MARGIN + 10 + PHOTO_W + 10]) {
      page.drawRectangle({ x: px, y: photoY, width: PHOTO_W, height: PHOTO_H, color: LGRAY, borderColor: GRAY, borderWidth: 0.5 });
    }

    // Chargement des photos en parallèle
    const [beforeBytes, afterBytes] = await Promise.all([
      order.photo_before_url ? fetchPhoto(order.photo_before_url, SR_KEY) : Promise.resolve(null),
      order.photo_after_url  ? fetchPhoto(order.photo_after_url,  SR_KEY) : Promise.resolve(null),
    ]);

    const embedPhoto = async (bytes: Uint8Array | null, px: number) => {
      if (!bytes) {
        page.drawText("Photo non disponible", { x: px + 8, y: photoY + PHOTO_H / 2, size: 7, font: regular, color: GRAY });
        return;
      }
      try {
        // Essaie JPEG puis PNG (les deux formats supportés par pdf-lib)
        let img;
        try { img = await doc.embedJpg(bytes); }
        catch { img = await doc.embedPng(bytes); }
        const { width: iw, height: ih } = img.size();
        const scale = Math.min(PHOTO_W / iw, PHOTO_H / ih);
        page.drawImage(img, {
          x: px + (PHOTO_W - iw * scale) / 2,
          y: photoY + (PHOTO_H - ih * scale) / 2,
          width:  iw * scale,
          height: ih * scale,
        });
      } catch {
        page.drawText("Erreur d'affichage", { x: px + 8, y: photoY + PHOTO_H / 2, size: 7, font: regular, color: GRAY });
      }
    };

    await Promise.all([
      embedPhoto(beforeBytes, MARGIN + 10),
      embedPhoto(afterBytes,  MARGIN + 10 + PHOTO_W + 10),
    ]);

    cy = photoY - 14;

    // ─────────── Section 4 : SIGNATURE DESTINATAIRE (si disponible) ───────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderAny = order as any;
    if (orderAny.signature_url) {
      cy = drawSection(page, bold, "Signature du destinataire", MARGIN, cy, CONTENT_W);

      const { data: sigBlob } = await ctx.supabaseAdmin.storage
        .from("delivery-photos")
        .download(orderAny.signature_url);

      if (sigBlob) {
        const sigBytes = new Uint8Array(await sigBlob.arrayBuffer());
        const SIG_W = 140;
        const SIG_H = 50;
        const sigX = MARGIN + 10;
        const sigY = cy - SIG_H;
        page.drawRectangle({ x: sigX, y: sigY, width: SIG_W, height: SIG_H, color: WHITE, borderColor: GRAY, borderWidth: 0.5 });
        try {
          const sigImg = await doc.embedPng(sigBytes);
          const { width: sw, height: sh } = sigImg.size();
          const scale = Math.min(SIG_W / sw, SIG_H / sh);
          page.drawImage(sigImg, {
            x: sigX + (SIG_W - sw * scale) / 2,
            y: sigY + (SIG_H - sh * scale) / 2,
            width: sw * scale,
            height: sh * scale,
          });
        } catch {
          page.drawText("Signature non affichable", { x: sigX + 8, y: sigY + SIG_H / 2 - 4, size: 7, font: regular, color: GRAY });
        }
        cy = sigY - 8;
      }

      cy = drawField(page, bold, regular, "Signé par :", safe(orderAny.signed_by_name), MARGIN + 10, cy);
      cy = drawField(page, bold, regular, "Signé le :", fmt(orderAny.signed_at), MARGIN + 10, cy);
      cy -= 10;
    }

    // ─────────── Section 4.5 : LIVRAISON SENSIBLE (si applicable) ────────────
    //
    // SÉCURITÉ DONNÉE PERSONNELLE :
    //   La photo de pièce d'identité n'est JAMAIS incluse dans ce certificat.
    //   Elle est accessible uniquement par un admin via Edge Function admin-view-id,
    //   avec traçabilité dans audit_log. Jamais exposée au livreur ni au client.
    //
    // TODO : Politique de conservation/suppression des pièces d'identité à définir
    //        avant lancement (conformité CDP Sénégal — Commission des Données Personnelles).
    const orderSensitive = order as any;
    if (orderSensitive.is_sensitive) {
      cy = drawSection(page, bold, "Livraison sensible — controles renforces", MARGIN, cy, CONTENT_W);

      const idTypeLabel = orderSensitive.expected_id_type
        ? ({ cni: "CNI", passeport: "Passeport", permis: "Permis de conduire" } as Record<string, string>)[orderSensitive.expected_id_type] ?? orderSensitive.expected_id_type
        : "N/A";

      cy = drawField(page, bold, regular, "Type piece :",    safe(idTypeLabel),                                           MARGIN + 10, cy);
      cy = drawField(page, bold, regular, "Nom attendu :",   safe(orderSensitive.expected_id_name ?? "N/A"),              MARGIN + 10, cy);
      cy = drawField(page, bold, regular, "Double code :",   bothCodesValidated ? "Oui — 2 codes valides" : "Non complet", MARGIN + 10, cy);
      // "Identite verifiee" : on affiche l'horodatage de la verification, jamais la photo.
      cy = drawField(page, bold, regular, "Identite :",
        orderSensitive.id_verified_at
          ? `Verifiee le ${fmt(orderSensitive.id_verified_at)}`
          : "Non verifiee",
        MARGIN + 10, cy,
      );
      cy -= 10;
    }

    // ─────────── Section 5 : SIGNATURE SYSTEME ────────────────────────────────
    cy = drawSection(page, bold, "Signature système", MARGIN, cy, CONTENT_W);

    // QR code à droite — encode l'URL de vérification publique
    const QR_SIZE = 80;
    const QR_X    = PAGE_W - MARGIN - QR_SIZE - 6;
    const QR_Y    = cy - QR_SIZE - 6;

    // Fond blanc (quiet zone obligatoire autour d'un QR)
    page.drawRectangle({ x: QR_X - 5, y: QR_Y - 5, width: QR_SIZE + 10, height: QR_SIZE + 10, color: WHITE });
    drawQrCode(page, `https://seculiv.sn/verify/${certId}`, QR_X, QR_Y, QR_SIZE);
    page.drawText("Authenticité vérifiable sur seculiv.sn", {
      x: QR_X - 5, y: QR_Y - 16, size: 6, font: regular, color: GRAY,
    });

    // Texte de certification (colonne gauche)
    page.drawText("Certifié par le système SECULIV", {
      x: MARGIN + 10, y: cy, size: 8.5, font: bold, color: DARK,
    });
    cy -= 14;
    page.drawText(`Horodatage : ${fmt(new Date().toISOString())}`, {
      x: MARGIN + 10, y: cy, size: 8, font: regular, color: GRAY,
    });
    cy -= 13;
    page.drawText(`ID Certificat : ${certId}`, { x: MARGIN + 10, y: cy, size: 7.5, font: regular, color: GRAY });
    cy -= 12;
    page.drawText("SHA-256 :", { x: MARGIN + 10, y: cy, size: 7, font: bold, color: GRAY });
    cy -= 10;
    // Hash sur deux lignes (64 hex chars → 42 + 22)
    page.drawText(docHash.slice(0, 42), { x: MARGIN + 10, y: cy, size: 6.5, font: regular, color: GRAY });
    cy -= 10;
    page.drawText(docHash.slice(42),    { x: MARGIN + 10, y: cy, size: 6.5, font: regular, color: GRAY });

    // ── Footer navy ──────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 24, color: NAVY });
    page.drawText(
      `SECULIV • Dakar, Sénégal • seculiv.sn • Document généré automatiquement`,
      { x: MARGIN, y: 8, size: 7, font: regular, color: WHITE },
    );

    // ── 9. Export PDF bytes ───────────────────────────────────────────────────
    const pdfBytes = await doc.save();

    // ── 10. Upload storage ────────────────────────────────────────────────────
    // Le bucket est PRIVE : aucun accès direct sans signed URL.
    // Seule la service_role (ici dans la Edge Function) peut écrire.
    // L'app mobile obtiendra une signed URL éphémère pour lire le PDF.
    const pdfPath = `${order_id}.pdf`;
    const { error: uploadErr } = await ctx.supabaseAdmin.storage
      .from("certificates")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadErr) {
      return Response.json(
        { error: "Echec upload : " + uploadErr.message },
        { status: 500, headers: CORS },
      );
    }

    // ── 11. INSERT en base ────────────────────────────────────────────────────
    const { error: insertErr } = await ctx.supabaseAdmin
      .from("certificates")
      .insert({ id: certId, order_id, pdf_path: pdfPath, doc_hash: docHash });

    if (insertErr) {
      // Rollback du fichier pour éviter un orphelin dans le bucket
      await ctx.supabaseAdmin.storage.from("certificates").remove([pdfPath]);
      return Response.json(
        { error: "Echec enregistrement : " + insertErr.message },
        { status: 500, headers: CORS },
      );
    }

    // ── 12. Push notification : certificat prêt (fire-and-forget) ─────────────
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SR_KEY}`,
      },
      body: JSON.stringify({
        profile_id: order.client_id,
        title: "📄 Votre certificat est prêt",
        body: "Le certificat de livraison est disponible dans votre espace SECULIV.",
        data: { screen: "certificates", orderId: order_id },
        category: "certificate",
      }),
    }).catch(() => {});

    return Response.json(
      { success: true, certificate_id: certId, pdf_path: pdfPath },
      { headers: CORS },
    );
  }),
};
