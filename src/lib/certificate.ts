import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { Certificate } from '@/src/types';
import { supabase } from './supabase';

export async function getCertificate(orderId: string): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from('certificates')
    .select('id, order_id, pdf_path, doc_hash, created_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Certificate;
}

// TODO: Signature manuscrite du destinataire à intégrer (sous-étape signature)
// Pour l'instant le certificat porte la validation système.
export async function downloadCertificate(
  certificateId: string,
  pdfPath: string
): Promise<void> {
  const { data: signed, error: signErr } = await supabase.storage
    .from('certificates')
    .createSignedUrl(pdfPath, 3600);

  if (signErr || !signed?.signedUrl) {
    throw new Error('Impossible de générer le lien de téléchargement.');
  }

  const localUri = `${FileSystem.documentDirectory}cert_${certificateId.slice(0, 8)}.pdf`;
  const { status } = await FileSystem.downloadAsync(signed.signedUrl, localUri);
  if (status !== 200) throw new Error('Téléchargement échoué.');

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Partage de fichiers non disponible sur cet appareil.');

  await Sharing.shareAsync(localUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Certificat de livraison SECULIV',
    UTI: 'com.adobe.pdf',
  });
}
