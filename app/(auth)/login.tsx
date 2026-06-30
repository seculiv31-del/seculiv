import { useState } from 'react';
import { router } from 'expo-router';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { TextField } from '@/src/components/TextField';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

const logoColor = require('@/assets/images/logo-color.png');
const logo3 = require('@/assets/images/logo-3.png');

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);

    if (mode === 'login') {
      if (!phone.trim() || !password) {
        setError('Renseigne ton numéro de téléphone et ton mot de passe.');
        return;
      }

      setSubmitting(true);
      const { error: signInError } = await signIn(phone.trim(), password);
      setSubmitting(false);

      if (signInError) {
        setError(signInError);
        return;
      }
    } else {
      if (!fullName.trim() || !phone.trim() || !password) {
        setError('Le nom, le téléphone et le mot de passe sont obligatoires.');
        return;
      }
      if (password.length < 8) {
        setError('Le mot de passe doit contenir au moins 8 caractères.');
        return;
      }

      setSubmitting(true);
      const { error: signUpError } = await signUp(email.trim(), password, fullName.trim(), phone.trim());
      setSubmitting(false);

      if (signUpError) {
        setError(signUpError);
        return;
      }
    }

    router.replace('/');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={['top']} style={[styles.banner, styles.bannerLight]}>
          <Image
            source={mode === 'signup' ? logoColor : logo3}
            style={styles.logoColor}
            resizeMode="contain"
          />

        </SafeAreaView>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              onPress={() => switchMode('login')}
              style={[styles.tab, mode === 'login' && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Connexion</Text>
            </Pressable>
            <Pressable
              onPress={() => switchMode('signup')}
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Inscription</Text>
            </Pressable>
          </View>

          {mode === 'signup' && (
            <TextField
              label="Nom complet"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ex. Awa Diop"
              autoCapitalize="words"
            />
          )}

          <TextField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            placeholder="77 123 45 67"
            keyboardType="phone-pad"
          />

          {mode === 'signup' && (
            <View style={styles.emailField}>
              <TextField
                label="E-mail (optionnel)"
                value={email}
                onChangeText={setEmail}
                placeholder="ton@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.helper}>
                Optionnel : sert uniquement à récupérer ton compte si tu oublies ton mot de passe.
              </Text>
            </View>
          )}

          <View style={styles.passwordField}>
            <TextField
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
            {mode === 'signup' && <Text style={styles.helper}>8 caractères minimum</Text>}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            title={
              mode === 'login'
                ? submitting
                  ? 'Connexion…'
                  : 'Se connecter'
                : submitting
                  ? 'Création du compte…'
                  : 'Créer mon compte'
            }
            onPress={handleSubmit}
            loading={submitting}
          />

          {mode === 'login' ? (
            <View style={styles.secureBadge}>
              <Text style={styles.secureBadgeText}>Connexion chiffrée · session sécurisée</Text>
            </View>
          ) : (
            <Text style={styles.signupNote}>
              En créant un compte, tu rejoins l'espace client. Les livreurs sont enregistrés par
              l'équipe SECULIV.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
  },
  banner: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  slogan: {
    fontSize: 13,
    color: '#9FB0CC',
    letterSpacing: 0.5,
  },
  sloganDark: {
    color: colors.muted,
  },
  bannerLight: {
    backgroundColor: colors.white,
  },
  logoColor: {
    width: 200,
    height: 200,
  },
  card: {
    flex: 1,
    marginTop: -spacing.xxl,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.greenSoft,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  tabTextActive: {
    color: '#2E7D43',
  },
  emailField: {
    gap: spacing.xs,
  },
  passwordField: {
    gap: spacing.xs,
  },
  helper: {
    fontSize: 12,
    color: colors.muted,
  },
  errorText: {
    fontSize: 13,
    color: '#D14343',
  },
  secureBadge: {
    alignSelf: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  secureBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D43',
  },
  signupNote: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
