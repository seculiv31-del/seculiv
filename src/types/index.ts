export type UserRole = 'client' | 'driver' | 'admin';

export type NotifPrefs = {
  delivery: boolean;
  proximity: boolean;
  certificate: boolean;
  promo: boolean;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  notif_prefs: NotifPrefs;
};

export type PushToken = {
  id: string;
  profile_id: string;
  token: string;
  platform: 'ios' | 'android' | null;
  created_at: string;
};

export type ParcelType = 'standard' | 'valeur_elevee' | 'confidentiel' | 'sensible';

export type ProtectionLevel = 'standard' | 'securise' | 'premium';

export type OrderStatus =
  | 'en_attente'
  | 'assignee'
  | 'enlevement'
  | 'en_transport'
  | 'arrivee'
  | 'livree'
  | 'annulee';

export type PaymentMethod = 'cash' | 'wave' | 'orange_money';
export type PaymentStatus = 'en_attente' | 'paye' | 'probleme';

export type OrderPickup = {
  address: string;
  notes?: string;
  voice_guidance_url?: string;
  lat?: number;
  lng?: number;
};

export type OrderDropoff = {
  address: string;
  name: string;
  phone: string;
  notes?: string;
  voice_guidance_url?: string;
  lat?: number;
  lng?: number;
};

export type CodeType = 'expediteur' | 'destinataire';

export type Order = {
  id: string;
  client_id: string;
  driver_id: string | null;
  pickup: OrderPickup;
  dropoff: OrderDropoff;
  parcel_type: ParcelType;
  protection_level: ProtectionLevel;
  price_fcfa: number;
  status: OrderStatus;
  photo_before_url: string | null;
  photo_after_url: string | null;
  eta_minutes: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_at: string | null;
  signature_url: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  is_sensitive: boolean;
  expected_id_type: string | null;
  expected_id_name: string | null;
  id_photo_url: string | null;
  id_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverStatus = 'disponible' | 'en_course' | 'suspendu' | 'hors_ligne';

export type Driver = {
  id: string;
  profile_id: string;
  moto_plate: string | null;
  trust_score: number;
  status: DriverStatus;
  is_verified: boolean;
  created_at: string;
};

export type IncidentType =
  | 'retard'
  | 'colis_endommage'
  | 'suspicion'
  | 'comportement'
  | 'autre';

export type IncidentStatus = 'ouvert' | 'en_cours' | 'resolu' | 'suspension_auto';

export type Incident = {
  id: string;
  order_id: string | null;
  reported_by: string | null;
  type: IncidentType;
  status: IncidentStatus;
  description: string | null;
  created_at: string;
};

export type Certificate = {
  id: string;
  order_id: string;
  pdf_path: string;
  doc_hash: string;
  created_at: string;
};

export type RaterRole = 'expediteur' | 'destinataire';

export type DeliveryRating = {
  id: string;
  order_id: string;
  rated_by: string;
  rater_role: RaterRole;
  score: number;
  comment: string | null;
  created_at: string;
};

export type AnomalyType = 'detour' | 'arret_prolonge' | 'coupure_gps' | 'echec_code';
export type AnomalySeverity = 'faible' | 'elevee';

export type MonitoringEvent = {
  id: string;
  order_id: string | null;
  driver_id: string | null;
  type: AnomalyType;
  severity: AnomalySeverity;
  penalty: number;
  detail: string | null;
  created_at: string;
};
