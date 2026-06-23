import * as ImageManipulator from 'expo-image-manipulator';

import { supabase } from './supabase';

export type UploadPhotoResult = {
  success: boolean;
  signedUrl: string;
};

export async function uploadDeliveryPhoto(
  orderId: string,
  type: 'before' | 'after',
  uri: string
): Promise<UploadPhotoResult> {
  // Appel 1 : récupère les dimensions d'origine sans compression.
  const original = await ImageManipulator.manipulateAsync(uri, [], {
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const { width, height } = original;

  // Réduit le plus grand côté à ≤ 1200 px — réseau limité au Sénégal.
  const maxSide = Math.max(width, height);
  const scale = maxSide > 1200 ? 1200 / maxSide : 1;
  const actions: ImageManipulator.Action[] =
    scale < 1 ? [{ resize: { width: Math.round(width * scale) } }] : [];

  // Appel 2 : compresse à 75 % JPEG + encode directement en base64.
  const compressed = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  // Décode base64 → Uint8Array pour l'upload binaire vers Supabase Storage.
  const binary = atob(compressed.base64!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const path = `orders/${orderId}/${type}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('delivery-photos')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    throw new Error(`Envoi échoué : ${uploadError.message}. Vérifiez votre connexion.`);
  }

  // URL signée 1 an pour archivage légal — retournée au livreur pour affichage immédiat.
  const { data: signedData, error: signedError } = await supabase.storage
    .from('delivery-photos')
    .createSignedUrl(path, 365 * 24 * 60 * 60);

  if (signedError || !signedData) {
    throw new Error(`URL signée impossible : ${signedError?.message}`);
  }

  // Stocke le chemin Storage (pas l'URL signée) pour que le client génère
  // des URLs fraîches à l'affichage (cf. track.tsx createSignedUrl 1h).
  const column = type === 'before' ? 'photo_before_url' : 'photo_after_url';
  const { error: updateError } = await supabase
    .from('orders')
    .update({ [column]: path })
    .eq('id', orderId);

  if (updateError) {
    throw new Error(`Mise à jour commande échouée : ${updateError.message}`);
  }

  return { success: true, signedUrl: signedData.signedUrl };
}
