-- Table des push tokens (un appareil peut avoir un token par utilisateur)
create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  token       text not null,
  platform    text,                    -- 'ios' | 'android'
  created_at  timestamptz not null default now(),
  unique(profile_id, token)
);
alter table public.push_tokens enable row level security;

-- Chacun gère ses propres tokens
create policy "gerer ses tokens" on public.push_tokens
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Préférences de notification dans le profil
alter table public.profiles
  add column if not exists notif_prefs jsonb not null default '{"delivery":true,"proximity":true,"certificate":true,"promo":false}';
