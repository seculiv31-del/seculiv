-- Étape 6.6 — Monitoring IA : événements d'anomalie et config des seuils.

create type anomaly_type     as enum ('detour', 'arret_prolonge', 'coupure_gps', 'echec_code');
create type anomaly_severity as enum ('faible', 'elevee');

create table public.monitoring_events (
  id          uuid             primary key default gen_random_uuid(),
  order_id    uuid             references public.orders(id)  on delete cascade,
  driver_id   uuid             references public.drivers(id) on delete cascade,
  type        anomaly_type     not null,
  severity    anomaly_severity not null default 'faible',
  penalty     int              not null default 0,   -- points retirés au trust_score
  detail      text,
  created_at  timestamptz      not null default now()
);

alter table public.monitoring_events enable row level security;

-- Seul l'admin peut lire les événements de monitoring.
-- NOTE : public.current_role() retourne null en contexte RLS ;
-- on utilise le rôle applicatif stocké dans profiles.role.
create policy admin_lit_monitoring on public.monitoring_events
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Colonne de suivi de la dernière mise à jour du score livreur.
alter table public.drivers
  add column if not exists last_score_update timestamptz default now();

-- Config des seuils, modifiable par l'admin sans redéploiement.
create table public.monitoring_config (
  key   text    primary key,
  value numeric not null
);

insert into public.monitoring_config (key, value) values
  ('detour_km',         2),
  ('arret_minutes',    10),
  ('coupure_minutes',   3),
  ('seuil_suspension', 60)
on conflict (key) do nothing;
