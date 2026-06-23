-- Table de journalisation pour les accès admin aux données sensibles.
-- Toute consultation d'une pièce d'identité via admin-view-id est tracée ici.
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles(id),
  action     text not null,
  target     text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- L'admin lit uniquement ses propres entrées (service_role lit tout).
create policy "admin lit son audit" on public.audit_log
  for select using (auth.uid() = admin_id);

-- Anti-bruteforce sur les codes secret : compteur de tentatives.
alter table public.secret_codes
  add column if not exists attempts int not null default 0;

-- Remplace la contrainte unique order_id-only par (order_id, code_type)
-- afin d'autoriser un code expéditeur + un code destinataire par commande sensible.
alter table public.secret_codes
  drop constraint if exists secret_codes_order_id_key;

alter table public.secret_codes
  add constraint uq_secret_codes_order_code_type unique (order_id, code_type);
