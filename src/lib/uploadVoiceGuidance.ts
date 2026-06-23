import * as FileSystem from 'expo-file-system';

import { supabase } from './supabase';

export async function uploadVoiceGuidance(localUri: string): Promise<{ path: string } | { error: string }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Préfixe "orders/" requis par la politique RLS de delivery-photos
    const path = `orders/voice-guidance/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.m4a`;

    const { error } = await supabase.storage
      .from('delivery-photos')
      .upload(path, bytes, { contentType: 'audio/m4a', upsert: false });

    if (error) return { error: `Envoi audio échoué : ${error.message}` };
    return { path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload audio." };
  }
}
