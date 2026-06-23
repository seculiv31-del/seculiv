import { colors } from '@/src/theme/colors';
import type { ProtectionLevel } from '@/src/types';

export type Plan = {
  id: ProtectionLevel;
  name: string;
  price: number;
  color: string;
  insurance: string;
  includes: string[];
};

export const PLANS: Plan[] = [
  {
    id: 'standard',
    name: 'Standard',
    price: 1800,
    color: colors.navy,
    insurance: 'Assurance de base incluse',
    includes: ['Livraison suivie', 'Notification SMS au destinataire', 'Support client'],
  },
  {
    id: 'securise',
    name: 'Sécurisé',
    price: 3200,
    color: colors.green,
    insurance: "Assurance jusqu’à 100 000 F",
    includes: ['Tout Standard', 'Code secret à la remise', 'Double photo dépôt / réception'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 4500,
    color: colors.gold,
    insurance: "Assurance renforcée jusqu’à 500 000 F",
    includes: [
      'Tout Sécurisé',
      'Intervention prioritaire en cas de litige',
      'Suivi GPS prioritaire',
    ],
  },
];

export function getPlan(id: ProtectionLevel): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}
