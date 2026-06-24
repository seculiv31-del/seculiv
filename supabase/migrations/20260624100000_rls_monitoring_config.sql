-- Active RLS sur monitoring_config (seule table qui en était dépourvue).
-- La table stocke des seuils d'IA — seul l'admin doit pouvoir la lire/modifier.
-- Le service_role (Edge Functions) contourne RLS par défaut et conserve son accès.

alter table public.monitoring_config enable row level security;

-- Lecture : admin seulement
create policy "admin lit monitoring_config" on public.monitoring_config
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Écriture : admin seulement
create policy "admin modifie monitoring_config" on public.monitoring_config
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
