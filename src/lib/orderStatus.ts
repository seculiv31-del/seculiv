import type { PillTone } from '@/src/components/Pill';
import type { OrderStatus, ParcelType } from '@/src/types';

export const PARCEL_TYPE_LABELS: Record<ParcelType, string> = {
  standard: 'Standard',
  valeur_elevee: 'Valeur élevée',
  confidentiel: 'Confidentiel',
  sensible: 'Livraison sensible',
};

export type OrderStatusInfo = {
  label: string;
  tone: PillTone;
};

const STATUS_INFO: Record<OrderStatus, OrderStatusInfo> = {
  en_attente: { label: 'En attente', tone: 'gray' },
  assignee: { label: 'Livreur assigné', tone: 'amber' },
  enlevement: { label: 'Enlèvement en cours', tone: 'amber' },
  en_transport: { label: 'En transport', tone: 'amber' },
  arrivee: { label: 'Arrivé chez le destinataire', tone: 'amber' },
  livree: { label: 'Livrée', tone: 'green' },
  annulee: { label: 'Annulée', tone: 'red' },
};

export function getOrderStatusInfo(status: OrderStatus): OrderStatusInfo {
  return STATUS_INFO[status];
}

// Une commande est "active" tant qu'elle n'est pas terminée (livrée ou annulée).
export function isOrderActive(status: OrderStatus): boolean {
  return status !== 'livree' && status !== 'annulee';
}

export type TrackingStep = {
  key: string;
  label: string;
  done: boolean;
};

const STATUS_ORDER: OrderStatus[] = [
  'en_attente',
  'assignee',
  'enlevement',
  'en_transport',
  'arrivee',
  'livree',
];

// Checklist affichée sur l'écran Suivi : "sécurisé / surveillance / en route / validation code".
export function getTrackingSteps(status: OrderStatus): TrackingStep[] {
  const currentIndex = STATUS_ORDER.indexOf(status);

  const steps: { key: string; label: string; reachedAt: OrderStatus }[] = [
    { key: 'secured', label: 'Commande sécurisée et enregistrée', reachedAt: 'en_attente' },
    { key: 'watched', label: 'Sous surveillance · livreur assigné', reachedAt: 'assignee' },
    { key: 'transit', label: 'En route vers le destinataire', reachedAt: 'en_transport' },
    { key: 'code', label: 'Validation du code à la livraison', reachedAt: 'livree' },
  ];

  return steps.map((step) => ({
    key: step.key,
    label: step.label,
    done: currentIndex >= STATUS_ORDER.indexOf(step.reachedAt),
  }));
}
