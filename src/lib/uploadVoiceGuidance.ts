import { supabase } from './supabase';

export async function uploadVoiceGuidance(localUri: string): Promise<{ path: string } | { error: string }> {
  try {
    const response = await fetch(localUri);
    if (!response.ok) return { error: `Lecture du fichier audio échouée (${response.status})` };

    const blob = await response.blob();

    const path = `orders/voice-guidance/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.m4a`;

    const { error } = await supabase.storage
      .from('delivery-photos')
      .upload(path, blob, { contentType: 'audio/m4a', upsert: false });

    if (error) return { error: `Envoi audio échoué : ${error.message}` };
    return { path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur d'upload audio." };
  }
}
