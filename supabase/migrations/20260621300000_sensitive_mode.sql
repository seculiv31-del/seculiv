-- Colonnes mode sensible dans orders
alter table public.orders
  add column if not exists is_sensitive     boolean not null default false,
  add column if not exists expected_id_type text,
  add column if not exists expected_id_name text,
  add column if not exists id_photo_url      text,
  add column if not exists id_verified_at    timestamptz;

-- Type de code (expéditeur / destinataire) pour le double code
create type code_type as enum ('expediteur', 'destinataire');
alter table public.secret_codes
  add column if not exists code_type code_type not null default 'expediteur';
