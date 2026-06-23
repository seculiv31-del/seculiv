import { supabase } from './supabase';

type UploadSignatureResult =
  | { path: string }
  | { error: string };

export async function uploadSignature(
  orderId: string,
  base64DataUrl: string,
  signedByName: string,
): Promise<UploadSignatureResult> {
  try {
    // Retire le préfixe data URL (data:image/png;base64,...)
    const base64 = base64DataUrl.replace(/^data:image\/[^;]+;base64,/, '');

    // Décode base64 → Uint8Array pour l'upload binaire
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const path = `orders/${orderId}/signature.png`;

    const { error: uploadError } = await supabase.storage
      .from('delivery-photos')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      return { error: `Envoi de la signature échoué : ${uploadError.message}` };
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        signature_url: path,
        signed_at: new Date().toISOString(),
        signed_by_name: signedByName,
      })
      .eq('id', orderId);

    if (updateError) {
      return { error: `Mise à jour commande échouée : ${updateError.message}` };
    }

    return { path };
  } catch {
    return { error: 'Erreur inattendue lors de l\'enregistrement de la signature.' };
  }
}
