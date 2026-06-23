-- Étape 6.4 : paiement à la livraison (espèces)
-- Ce SQL a été appliqué directement via supabase db query --linked.
-- Il utilise des types ENUM (pas text+check) pour pouvoir ajouter Wave/OM plus
-- tard via ALTER TYPE … ADD VALUE sans migration destructive.

create type if not exists payment_method as enum ('cash', 'wave', 'orange_money');
create type if not exists payment_status  as enum ('en_attente', 'paye', 'probleme');

alter table public.orders
  add column if not exists payment_method payment_method not null default 'cash',
  add column if not exists payment_status payment_status not null default 'en_attente',
  add column if not exists paid_at        timestamptz;

-- La politique RLS existante (le livreur peut UPDATE la commande qui lui est
-- assignée) couvre déjà la mise à jour de payment_status lors de l'encaissement.
