// Doit être importé avant toute autre librairie réseau : fournit les
// polyfills (URL, encoding...) dont supabase-js a besoin sur React Native.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuration Supabase manquante : vérifie EXPO_PUBLIC_SUPABASE_URL et ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans le fichier .env à la racine du projet.'
  );
}

// Sur web, AsyncStorage s'appuie sur `window.localStorage`, qui n'existe pas
// pendant le rendu statique côté serveur (expo-router, web.output "static").
// Sans ce garde-fou, l'initialisation du client plante le serveur Metro au
// démarrage avec "window is not defined".
const ssrSafeStorage = {
  getItem: (key: string): Promise<string | null> =>
    typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key),
  setItem: (key: string, value: string): Promise<void> =>
    typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> =>
    typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key),
};

// La clé "anon" est publique par conception : elle est destinée à être
// embarquée dans l'app. La sécurité réelle des données est assurée côté
// Supabase par les policies RLS (Row Level Security), pas par ce secret.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
