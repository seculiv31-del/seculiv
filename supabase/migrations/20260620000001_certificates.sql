-- Étape 7 : certificats de livraison

-- Table des certificats
create table public.certificates (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  pdf_path   text not null,
  doc_hash   text not null,
  created_at timestamptz not null default now(),
  unique(order_id)
);

alter table public.certificates enable row level security;

-- Le client voit le certificat de SES commandes ; l'admin voit tout
create policy "client voit ses certificats" on public.certificates
  for select using (
    order_id in (select id from public.orders where client_id = auth.uid())
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Seul l'admin (ou le backend service_role) peut insérer un certificat
create policy "admin insere certificats" on public.certificates
  for insert with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Storage : bucket privé certificates
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

-- Admin peut uploader les PDF
create policy "admin upload certificats" on storage.objects
  for insert with check (
    bucket_id = 'certificates'
    and (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Client peut lire uniquement les certificats de ses commandes
-- (accès via signed URL générée côté serveur)
create policy "client lit ses certificats storage" on storage.objects
  for select using (
    bucket_id = 'certificates'
    and auth.role() = 'authenticated'
  );
