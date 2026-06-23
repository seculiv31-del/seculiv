import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';

const FUNCTION_URL =
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-certificate`;

export function useCertificate(orderId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const download = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ── 1. JWT courant ─────────────────────────────────────────────────────
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié.');

      // ── 2. Appel Edge Function (génère ou renvoie le cert existant) ─────────
      const res = await fetch(FUNCTION_URL, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: orderId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Erreur serveur (${res.status}).`);
      }

      const { pdf_path } = await res.json() as { pdf_path: string };

      // ── 3. Signed URL éphémère (1 h) pour lire le PDF depuis le bucket privé
      const { data: signed, error: signErr } = await supabase.storage
        .from('certificates')
        .createSignedUrl(pdf_path, 3600);

      if (signErr || !signed?.signedUrl) {
        throw new Error('Impossible de générer le lien de téléchargement.');
      }

      // ── 4. Téléchargement local ────────────────────────────────────────────
      const localUri = `${FileSystem.documentDirectory}cert_${orderId.slice(0, 8)}.pdf`;
      const { status } = await FileSystem.downloadAsync(signed.signedUrl, localUri);
      if (status !== 200) throw new Error('Téléchargement échoué.');

      // ── 5. Partage natif (ouvre le visionneur PDF du système) ─────────────
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('Partage de fichiers non disponible sur cet appareil.');

      await Sharing.shareAsync(localUri, {
        mimeType:    'application/pdf',
        dialogTitle: 'Certificat de livraison SECULIV',
        UTI:         'com.adobe.pdf',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  return { download, loading, error };
}
