import type { AnomalySeverity, AnomalyType, DriverStatus, IncidentStatus, OrderStatus } from '@/src/types';

import { supabase } from './supabase';

// ─── Stats pour le dashboard ──────────────────────────────────────────────────

export type AdminStats = {
  activeOrders:     number;
  availableDrivers: number;
  openIncidents:    number;
  revenueToday:     number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [ordersRes, driversRes, incidentsRes, revenueRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(livree,annulee)'),
    supabase
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'disponible'),
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ouvert'),
    supabase
      .from('orders')
      .select('price_fcfa')
      .eq('payment_status', 'paye')
      .gte('paid_at', todayStart.toISOString()),
  ]);

  const revenueToday = (revenueRes.data ?? []).reduce(
    (sum, o) => sum + (o.price_fcfa as number),
    0
  );

  return {
    activeOrders:     ordersRes.count ?? 0,
    availableDrivers: driversRes.count ?? 0,
    openIncidents:    incidentsRes.count ?? 0,
    revenueToday,
  };
}

// ─── Commandes ────────────────────────────────────────────────────────────────

export type OrderRow = {
  id: string;
  client_id: string;
  driver_id: string | null;
  pickup:    { address: string };
  dropoff:   { address: string; name: string; phone: string };
  parcel_type: string;
  protection_level: string;
  price_fcfa: number;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
  driver_name: string | null;
  // Mode livraison sensible
  is_sensitive: boolean;
  id_photo_url: string | null;
};

export async function listOrders(status?: OrderStatus): Promise<OrderRow[]> {
  let query = supabase
    .from('orders')
    .select('id, client_id, driver_id, pickup, dropoff, parcel_type, protection_level, price_fcfa, status, payment_status, created_at, is_sensitive, id_photo_url, profiles:driver_id(full_name)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data } = await query;
  return (data ?? []).map((row: any) => ({
    ...row,
    driver_name: row.profiles?.full_name ?? null,
  })) as OrderRow[];
}

export type AssignableDriver = {
  id: string;
  moto_plate: string | null;
  trust_score: number;
  status: DriverStatus;
  full_name: string | null;
};

export async function listAssignableDrivers(): Promise<AssignableDriver[]> {
  const { data } = await supabase
    .from('drivers')
    .select('id, moto_plate, trust_score, status, profiles:profile_id(full_name)')
    .eq('status', 'disponible')
    .order('trust_score', { ascending: false });

  return (data ?? []).map((d: any) => ({
    id:          d.id as string,
    moto_plate:  d.moto_plate as string | null,
    trust_score: d.trust_score as number,
    status:      d.status as DriverStatus,
    full_name:   d.profiles?.full_name ?? null,
  }));
}

export async function assignOrder(orderId: string, driverId: string): Promise<string | null> {
  const { error } = await supabase
    .from('orders')
    .update({ driver_id: driverId, status: 'assignee' })
    .eq('id', orderId);
  return error?.message ?? null;
}

// ─── Livreurs ─────────────────────────────────────────────────────────────────

export type DriverRow = {
  id:          string;
  profile_id:  string;
  full_name:   string | null;
  phone:       string | null;
  moto_plate:  string | null;
  trust_score: number;
  status:      DriverStatus;
  is_verified: boolean;
  order_count: number;
};

export async function listDrivers(): Promise<DriverRow[]> {
  const { data } = await supabase
    .from('drivers')
    .select('id, profile_id, moto_plate, trust_score, status, is_verified, profiles:profile_id(full_name, phone)')
    .order('trust_score', { ascending: false });

  if (!data) return [];

  const ids = data.map((d) => d.id);
  const { data: orderCounts } = await supabase
    .from('orders')
    .select('driver_id')
    .in('driver_id', ids)
    .eq('status', 'livree');

  const countMap: Record<string, number> = {};
  (orderCounts ?? []).forEach((o) => {
    if (o.driver_id) countMap[o.driver_id] = (countMap[o.driver_id] ?? 0) + 1;
  });

  return data.map((d: any) => ({
    id:          d.id as string,
    profile_id:  d.profile_id as string,
    full_name:   d.profiles?.full_name ?? null,
    phone:       d.profiles?.phone ?? null,
    moto_plate:  d.moto_plate as string | null,
    trust_score: d.trust_score as number,
    status:      d.status as DriverStatus,
    is_verified: d.is_verified as boolean,
    order_count: countMap[d.id as string] ?? 0,
  }));
}

export type CreateDriverParams = {
  full_name:  string;
  email:      string;
  phone:      string;
  password:   string;
  moto_plate: string;
};

export async function createDriver(params: CreateDriverParams): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'Non authentifié.';

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-driver`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (res.ok) return null;

  try {
    const body = await res.json() as { error?: string };
    return body.error ?? `Erreur serveur (${res.status}).`;
  } catch {
    return `Erreur serveur (${res.status}).`;
  }
}

export async function toggleDriverSuspension(
  driverId: string,
  suspend: boolean
): Promise<string | null> {
  const nextStatus: DriverStatus = suspend ? 'suspendu' : 'disponible';
  const { error } = await supabase
    .from('drivers')
    .update({ status: nextStatus })
    .eq('id', driverId);
  return error?.message ?? null;
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export type IncidentRow = {
  id:          string;
  order_id:    string | null;
  type:        string;
  status:      IncidentStatus;
  description: string | null;
  created_at:  string;
  driver_name: string | null;
};

export async function listIncidents(): Promise<IncidentRow[]> {
  const { data } = await supabase
    .from('incidents')
    .select('id, order_id, type, status, description, created_at, orders(driver_id, profiles:driver_id(full_name))')
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id:          row.id,
    order_id:    row.order_id,
    type:        row.type,
    status:      row.status as IncidentStatus,
    description: row.description,
    created_at:  row.created_at,
    driver_name: (row.orders as { profiles?: { full_name: string | null } | null } | null)?.profiles?.full_name ?? null,
  }));
}

export async function updateIncidentStatus(
  incidentId: string,
  status:     IncidentStatus
): Promise<string | null> {
  const { error } = await supabase
    .from('incidents')
    .update({ status })
    .eq('id', incidentId);
  return error?.message ?? null;
}

// ─── Monitoring IA ────────────────────────────────────────────────────────────

export type MonitoringEventRow = {
  id:          string;
  order_id:    string | null;
  driver_id:   string | null;
  type:        AnomalyType;
  severity:    AnomalySeverity;
  penalty:     number;
  detail:      string | null;
  created_at:  string;
  driver_name: string | null;
};

export async function listMonitoringEvents(limit = 50): Promise<MonitoringEventRow[]> {
  const { data } = await supabase
    .from('monitoring_events')
    .select('id, order_id, driver_id, type, severity, penalty, detail, created_at, drivers!driver_id(profile_id, profiles!profile_id(full_name))')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: any) => ({
    id:          row.id as string,
    order_id:    row.order_id as string | null,
    driver_id:   row.driver_id as string | null,
    type:        row.type as AnomalyType,
    severity:    row.severity as AnomalySeverity,
    penalty:     row.penalty as number,
    detail:      row.detail as string | null,
    created_at:  row.created_at as string,
    driver_name: (row.drivers as { profiles?: { full_name: string | null } | null } | null)?.profiles?.full_name ?? null,
  }));
}

// ─── Stats dashboard monitoring ───────────────────────────────────────────────

export type MonitoringStats = {
  activeTrips:      number;
  anomaliesToday:   number;
  suspensionsToday: number;
  avgFleetScore:    number;
};

export async function getMonitoringStats(): Promise<MonitoringStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [tripsRes, anomaliesRes, suspensionsRes, driversRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['enlevement', 'en_transport', 'arrivee']),
    supabase
      .from('monitoring_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
    supabase
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'suspension_auto')
      .gte('created_at', todayIso),
    supabase
      .from('drivers')
      .select('trust_score')
      .not('status', 'in', '(suspendu,hors_ligne)'),
  ]);

  const scores = (driversRes.data ?? []).map((d: any) => d.trust_score as number);
  const avgFleetScore = scores.length > 0
    ? Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length)
    : 100;

  return {
    activeTrips:      tripsRes.count      ?? 0,
    anomaliesToday:   anomaliesRes.count  ?? 0,
    suspensionsToday: suspensionsRes.count ?? 0,
    avgFleetScore,
  };
}

// ─── Scores livreurs pour le monitoring ──────────────────────────────────────

export type DriverScoreRow = {
  id:                string;
  full_name:         string | null;
  trust_score:       number;
  status:            DriverStatus;
  anomaly_count_30d: number;
};

export async function listDriverScores(): Promise<DriverScoreRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [driversRes, eventsRes] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, trust_score, status, profiles:profile_id(full_name)')
      .order('trust_score', { ascending: true }),
    supabase
      .from('monitoring_events')
      .select('driver_id')
      .gte('created_at', thirtyDaysAgo)
      .not('driver_id', 'is', null),
  ]);

  const countMap: Record<string, number> = {};
  for (const ev of (eventsRes.data ?? [])) {
    const id = (ev as any).driver_id as string;
    countMap[id] = (countMap[id] ?? 0) + 1;
  }

  return (driversRes.data ?? []).map((d: any) => ({
    id:                d.id as string,
    full_name:         d.profiles?.full_name ?? null,
    trust_score:       d.trust_score as number,
    status:            d.status as DriverStatus,
    anomaly_count_30d: countMap[d.id as string] ?? 0,
  }));
}

// ─── Config des règles de détection ──────────────────────────────────────────

export type MonitoringConfigRow = {
  key:     string;
  value:   number;
  enabled: boolean;
};

export async function getMonitoringConfig(): Promise<MonitoringConfigRow[]> {
  const { data } = await supabase
    .from('monitoring_config')
    .select('key, value, enabled')
    .order('key');

  return (data ?? []).map((row: any) => ({
    key:     row.key     as string,
    value:   row.value   as number,
    enabled: row.enabled as boolean,
  }));
}

export async function updateMonitoringConfig(key: string, value: number): Promise<string | null> {
  const { error } = await supabase
    .from('monitoring_config')
    .update({ value })
    .eq('key', key);
  return error?.message ?? null;
}

export async function toggleMonitoringRule(key: string, enabled: boolean): Promise<string | null> {
  const { error } = await supabase
    .from('monitoring_config')
    .update({ enabled })
    .eq('key', key);
  return error?.message ?? null;
}

// ─── Réactivation livreur suspendu ───────────────────────────────────────────

export async function reactivateDriver(
  driverId:   string,
  resetScore: boolean,
): Promise<string | null> {
  const updates: Record<string, unknown> = { status: 'hors_ligne' };

  if (resetScore) {
    const { data: row } = await supabase
      .from('drivers')
      .select('trust_score')
      .eq('id', driverId)
      .single();
    const current = (row as any)?.trust_score as number ?? 0;
    updates.trust_score = Math.max(current, 70);
  }

  const { error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', driverId);

  return error?.message ?? null;
}
