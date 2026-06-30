import type { PillTone } from '@/src/components/Pill';
import type { DriverStatus, OrderStatus } from '@/src/types';

export type DriverAction = {
  label: string;
  nextStatus: OrderStatus;
  nextDriverStatus?: DriverStatus;
  requiresCode?: boolean;
};

// Action proposée au livreur pour faire progresser une course assignée.
// `arrivee` exige la saisie du code de validation avant de passer à `livree`
// (vérifié côté serveur via la RPC validate_secret_code).
const DRIVER_ACTIONS: Partial<Record<OrderStatus, DriverAction>> = {
  assignee: { label: "J'ai récupéré le colis", nextStatus: 'enlevement', nextDriverStatus: 'en_course' },
  enlevement: { label: 'Je suis en route', nextStatus: 'en_transport' },
  en_transport: { label: 'Je suis arrivé', nextStatus: 'arrivee' },
  arrivee: {
    label: 'Valider la livraison',
    nextStatus: 'livree',
    nextDriverStatus: 'disponible',
    requiresCode: true,
  },
};

export function getDriverAction(status: OrderStatus): DriverAction | null {
  return DRIVER_ACTIONS[status] ?? null;
}

export type DriverStatusInfo = {
  label: string;
  tone: PillTone;
};

export const DRIVER_STATUS_INFO: Record<DriverStatus, DriverStatusInfo> = {
  disponible: { label: 'Disponible', tone: 'green' },
  en_course: { label: 'En course', tone: 'amber' },
  hors_ligne: { label: 'Hors ligne', tone: 'gray' },
  suspendu: { label: 'Suspendu', tone: 'red' },
};
