import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Enregistre le token push Expo pour cet appareil.
 * Retourne le token si succès, null si émulateur, permission refusée ou EAS projectId absent.
 *
 * ⚠️  Pré-requis : EAS projectId dans app.json → extra.eas.projectId
 * Lance `eas init` puis ajoute le champ :
 *   "extra": { "eas": { "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" } }
 *
 * En attendant EAS : sur Expo Go en dev, le token est du type
 * "ExponentPushToken[...]" et fonctionne uniquement sur appareil physique.
 */
export async function registerForPushNotifications(profileId: string): Promise<string | null> {
  if (!Device.isDevice) {
    if (__DEV__) {
      console.warn('[Notifications] Push indisponible sur émulateur — teste sur un vrai téléphone.');
    }
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SECULIV',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#43B05C',
      sound: 'default',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) {
    console.error(
      '[Notifications] EAS projectId introuvable.\n' +
      '  → Lance : eas init\n' +
      '  → Puis dans app.json : "extra": { "eas": { "projectId": "<ton-id>" } }\n' +
      '  → En dev Expo Go : le projectId est requis depuis SDK 50.'
    );
    return null;
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = result.data;

    await supabase
      .from('push_tokens')
      .upsert(
        {
          profile_id: profileId,
          token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        },
        { onConflict: 'profile_id,token' }
      );

    return token;
  } catch (e) {
    console.error('[Notifications] getExpoPushTokenAsync échoué :', e);
    return null;
  }
}

/** Configure l'affichage des notifications en premier plan (alerte + son). */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Écoute les taps sur notification et navigue vers le bon écran.
 * Retourne une fonction de nettoyage.
 *
 * Payloads attendus dans data :
 *   { screen: 'driver-courses' }              → onglet courses livreur
 *   { screen: 'certificates', orderId: '...' } → liste des certificats
 *   { orderId: '...' }                         → suivi client
 */
export function registerNotificationListeners(
  navigate: (path: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;

    if (data.screen === 'driver-courses') {
      navigate('/(driver)/(tabs)/');
    } else if (data.screen === 'certificates') {
      navigate('/certificates');
    } else if (data.orderId) {
      navigate('/track');
    }
  });

  return () => sub.remove();
}
