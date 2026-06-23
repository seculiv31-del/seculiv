import type { PillTone } from '@/src/components/Pill';
import type { IncidentStatus, IncidentType } from '@/src/types';

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  retard:          'Retard',
  colis_endommage: 'Colis endommagé',
  suspicion:       'Comportement suspect',
  comportement:    'Comportement',
  autre:           'Autre',
};

export const INCIDENT_STATUS_INFO: Record<IncidentStatus, { label: string; tone: PillTone }> = {
  ouvert:          { label: 'Ouvert',         tone: 'amber' },
  en_cours:        { label: 'En cours',        tone: 'navy'  },
  resolu:          { label: 'Résolu',          tone: 'green' },
  suspension_auto: { label: 'Suspension auto', tone: 'red'   },
};

export function getNextIncidentStatus(status: IncidentStatus): IncidentStatus | null {
  if (status === 'ouvert')   return 'en_cours';
  if (status === 'en_cours') return 'resolu';
  return null;
}
