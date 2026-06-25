import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import type { Driver, Profile } from '@/src/types';

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  driver: Driver | null;
  // true si le profil a le rôle "driver" mais qu'aucune fiche `drivers`
  // correspondante n'existe en base (incohérence de données).
  driverError: boolean;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshDriver: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Traduit les messages d'erreur Supabase (en anglais) en messages clairs en français.
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Numéro de téléphone ou mot de passe incorrect.';
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'Un compte existe déjà avec ce numéro de téléphone.';
  }
  if (message.includes('Password should be at least')) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }
  if (message.includes('Unable to validate email') || message.includes('invalid format')) {
    return 'Adresse e-mail invalide.';
  }
  if (message.includes('Email not confirmed')) {
    return 'E-mail non confirmé. Vérifie ta boîte de réception.';
  }
  if (/network/i.test(message)) {
    return 'Connexion impossible. Vérifie ta connexion internet.';
  }
  return message;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, notif_prefs')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Erreur de chargement du profil :', error.message);
    return null;
  }

  return data as Profile;
}

async function fetchDriver(userId: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, profile_id, moto_plate, trust_score, status, is_verified, created_at')
    .eq('profile_id', userId)
    .single();

  if (error) {
    console.error('Erreur de chargement de la fiche livreur :', error.message);
    return null;
  }

  return data as Driver;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [driverError, setDriverError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session déjà ouverte au démarrage (stockée par AsyncStorage).
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const nextProfile = await fetchProfile(data.session.user.id);
        setProfile(nextProfile);
        if (nextProfile?.role === 'driver') {
          const nextDriver = await fetchDriver(data.session.user.id);
          setDriver(nextDriver);
          setDriverError(nextDriver === null);
        }
      }
      setLoading(false);
    });

    // Connexions/déconnexions qui surviennent ensuite.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        // On repasse en "loading" le temps de charger le profil du nouvel
        // utilisateur, sinon l'écran de routage redirigerait avec l'ancien
        // (ou un) rôle avant que `profile` soit à jour.
        setLoading(true);
        fetchProfile(newSession.user.id).then(async (nextProfile) => {
          setProfile(nextProfile);
          if (nextProfile?.role === 'driver') {
            const nextDriver = await fetchDriver(newSession.user.id);
            setDriver(nextDriver);
            setDriverError(nextDriver === null);
          } else {
            setDriver(null);
            setDriverError(false);
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setDriver(null);
        setDriverError(false);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function refreshDriver() {
    if (!session) return;
    const nextDriver = await fetchDriver(session.user.id);
    setDriver(nextDriver);
    setDriverError(nextDriver === null);
  }

  async function signIn(phone: string, password: string): Promise<AuthResult> {
    const { data: authEmail, error: rpcError } = await supabase
      .rpc('get_email_by_phone', { p_phone: phone });

    if (rpcError || !authEmail) {
      return { error: 'Aucun compte trouvé avec ce numéro de téléphone.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    return { error: error ? translateAuthError(error.message) : null };
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    phone: string
  ): Promise<AuthResult> {
    // L'e-mail est optionnel côté inscription, mais Supabase Auth exige un
    // identifiant e-mail technique. Si l'utilisateur n'en saisit pas, on en
    // génère un à partir de son téléphone : son compte fonctionne quand même,
    // mais il ne pourra pas récupérer un mot de passe oublié par e-mail.
    const authEmail = email || `${phone.replace(/\D/g, '')}@sans-email.seculiv.app`;

    // full_name et phone partent dans raw_user_meta_data : c'est ce que lit
    // le trigger SQL `handle_new_user` pour créer la ligne `profiles`.
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: { full_name: fullName, phone },
      },
    });
    return { error: error ? translateAuthError(error.message) : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        driver,
        driverError,
        loading,
        signIn,
        signUp,
        signOut,
        refreshDriver,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  }
  return context;
}
