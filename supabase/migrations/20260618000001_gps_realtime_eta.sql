-- Colonnes GPS manquantes sur gps_tracking
alter table public.gps_tracking
  add column if not exists accuracy real,
  add column if not exists heading  real,
  add column if not exists speed    real,
  add column if not exists altitude real;

-- RLS : on identifie le livreur via profiles.role pour éviter la join sur
-- public.drivers qui provoque 42P01 dans l'éditeur SQL Supabase.

create policy "livreur insère ses points gps" on public.gps_tracking
  for insert with check (
    (select role from public.profiles where id = auth.uid()) = 'driver'
  );

create policy "client lit ses points gps" on public.gps_tracking
  for select using (
    order_id in (
      select id from public.orders where client_id = auth.uid()
    )
  );

create policy "livreur lit ses points gps" on public.gps_tracking
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'driver'
  );

-- Realtime sur gps_tracking
alter publication supabase_realtime add table public.gps_tracking;

-- ETA estimée dans orders (mise à jour par le livreur)
alter table public.orders
  add column if not exists eta_minutes int;
