import { useState } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AntDesign } from '@expo/vector-icons';

import { Button } from '@/src/components/Button';
import { Logo } from '@/src/components/Logo';
import { TextField } from '@/src/components/TextField';
import { useAuth } from '@/src/lib/AuthContext';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp, signInWithGitHub } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
  }

  async function handleGitHubSignIn() {
    setError(null);
    setGithubLoading(true);
    const { error: oauthError, cancelled } = await signInWithGitHub();
    setGithubLoading(false);

    if (cancelled) return;
    if (oauthError) {
      setError(oauthError);
      return;
    }

    router.replace('/');
  }

  async function handleSubmit() {
    setError(null);

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Renseigne ton e-mail et ton mot de passe.');
        return;
      }

      setSubmitting(true);
      const { error: signInError } = await signIn(email.trim(), password);
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

    // La session est désormais ouverte (mise à jour via onAuthStateChange
    // dans AuthContext) : on repasse par l'écran de routage qui aiguille
    // vers le bon espace selon `profiles.role`.
    router.replace('/');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={['top']} style={styles.banner}>
          <Logo size={130} />
          <Text style={styles.slogan}>La sécurité n’est pas une option</Text>
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

          <View style={styles.emailField}>
            <TextField
              label={mode === 'signup' ? 'E-mail (optionnel)' : 'E-mail'}
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {mode === 'signup' && (
              <Text style={styles.helper}>
                Optionnel : sert uniquement à récupérer ton compte si tu oublies ton mot de
                passe.
              </Text>
            )}
          </View>

          {mode === 'signup' && (
            <TextField
              label="Téléphone"
              value={phone}
              onChangeText={setPhone}
              placeholder="77 123 45 67"
              keyboardType="phone-pad"
            />
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={handleGitHubSignIn}
            disabled={submitting || githubLoading}
            style={({ pressed }) => [
              styles.githubButton,
              (submitting || githubLoading) && styles.disabled,
              pressed && styles.githubButtonPressed,
            ]}
          >
            <AntDesign name="github" size={18} color={colors.white} />
            <Text style={styles.githubButtonText}>
              {githubLoading ? 'Connexion…' : 'Continuer avec GitHub'}
            </Text>
          </Pressable>

          {mode === 'login' ? (
            <View style={styles.secureBadge}>
              <Text style={styles.secureBadgeText}>Connexion chiffrée · session sécurisée</Text>
            </View>
          ) : (
            <Text style={styles.signupNote}>
              En créant un compte, tu rejoins l’espace client. Les livreurs sont enregistrés par
              l’équipe SECULIV.
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
    backgroundColor: colors.navy,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    fontSize: 12,
    color: colors.muted,
  },
  githubButton: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: '#24292E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  githubButtonPressed: {
    opacity: 0.85,
  },
  githubButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
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
