import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Bell, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { useAuth } from '@/src/lib/AuthContext';
import { registerForPushNotifications } from '@/src/lib/notifications';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

const STORAGE_KEY = 'seculiv.notif_prompted';

type Props = {
  /** Montre la modale dès que ce flag passe à true (ex: après 1re commande). */
  trigger: boolean;
};

/**
 * Modale de pré-permission notifications : demande à l'utilisateur son accord
 * AVANT de déclencher le dialog système (meilleure pratique UX).
 * S'affiche une seule fois (flag AsyncStorage).
 */
export default function NotificationPrompt({ trigger }: Props) {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trigger || !profile) return;
    // Ne jamais montrer sur émulateur, ni si déjà répondu
    if (!Device.isDevice) return;

    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return; // déjà accordé — pas besoin de montrer la modale

      const alreadyShown = await AsyncStorage.getItem(STORAGE_KEY);
      if (!alreadyShown) setVisible(true);
    })();
  }, [trigger, profile]);

  async function handleActivate() {
    if (!profile) return;
    setLoading(true);
    await AsyncStorage.setItem(STORAGE_KEY, 'shown');
    await registerForPushNotifications(profile.id);
    setLoading(false);
    setVisible(false);
  }

  async function handleDismiss() {
    await AsyncStorage.setItem(STORAGE_KEY, 'dismissed');
    setVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable style={styles.closeBtn} onPress={handleDismiss}>
            <X size={20} color={colors.muted} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Bell size={36} color={colors.green} />
          </View>

          <Text style={styles.title}>Restez informé en temps réel</Text>
          <Text style={styles.desc}>
            Recevez les mises à jour de vos livraisons — livreur en route, code
            de validation prêt, certificat disponible — directement sur votre
            téléphone.
          </Text>

          <View style={styles.buttons}>
            <Button
              title="Activer les notifications"
              onPress={handleActivate}
              loading={loading}
            />
            <Button
              title="Plus tard"
              variant="ghost"
              onPress={handleDismiss}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: spacing.xs,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
