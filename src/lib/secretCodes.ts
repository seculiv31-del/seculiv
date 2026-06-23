import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'secret-code:';

// Sur web, AsyncStorage s'appuie sur window.localStorage, absent pendant le
// rendu statique côté serveur (même garde-fou que src/lib/supabase.ts).
function isStorageAvailable(): boolean {
  return typeof window !== 'undefined';
}

// Le code en clair n'existe que côté client : la base ne stocke que son hash
// (secret_codes.code_hash). On le garde sur l'appareil qui a créé la commande
// pour pouvoir le réafficher au client dans l'onglet Suivi.
export async function storeSecretCode(orderId: string, code: string): Promise<void> {
  if (!isStorageAvailable()) return;
  await AsyncStorage.setItem(`${KEY_PREFIX}${orderId}`, code);
}

export async function getSecretCode(orderId: string): Promise<string | null> {
  if (!isStorageAvailable()) return null;
  return AsyncStorage.getItem(`${KEY_PREFIX}${orderId}`);
}
