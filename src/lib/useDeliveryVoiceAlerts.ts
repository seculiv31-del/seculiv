import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import type { Order } from '../types';

const STATUS_MESSAGES: Partial<Record<Order['status'], string>> = {
  enlevement:   'Votre livreur a pris en charge votre colis',
  en_transport: 'Votre livreur est en route vers vous',
  arrivee:      'Votre livreur est arrivé ! Préparez votre code secret.',
  livree:       'Votre colis a été livré avec succès',
};

export function useDeliveryVoiceAlerts(
  orderStatus: Order['status'] | null | undefined,
  etaMinutes: number | null | undefined
) {
  const lastStatusRef = useRef<string | null>(null);
  const lastEtaBucket = useRef<number | null>(null);

  useEffect(() => {
    if (!orderStatus) return;
    if (orderStatus === lastStatusRef.current) return;
    lastStatusRef.current = orderStatus;

    const msg = STATUS_MESSAGES[orderStatus];
    if (msg) {
      Speech.stop();
      Speech.speak(msg, { language: 'fr-FR', rate: 0.9 });
    }
  }, [orderStatus]);

  useEffect(() => {
    if (!etaMinutes || etaMinutes > 10) return;

    const bucket = etaMinutes <= 2 ? 2 : etaMinutes <= 5 ? 5 : 10;

    if (bucket === lastEtaBucket.current) return;
    lastEtaBucket.current = bucket;

    const msg =
      bucket === 2 ? 'Votre livreur sera là dans 2 minutes' :
      bucket === 5 ? 'Votre livreur est à 5 minutes' :
                     'Votre livreur approche, dans environ 10 minutes';

    Speech.stop();
    Speech.speak(msg, { language: 'fr-FR', rate: 0.9 });
  }, [etaMinutes]);
}
