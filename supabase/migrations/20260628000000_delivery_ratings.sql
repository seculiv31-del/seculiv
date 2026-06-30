-- Notation des livreurs par l'expéditeur et le destinataire après livraison
-- Optionnel : chaque partie peut noter 1 à 5 étoiles + commentaire libre.
-- Le score moyen est intégré dans le calcul du trust_score (Edge Function).

create table if not exists public.delivery_ratings (
  id          uuid        default gen_random_uuid() primary key,
  order_id    uuid        not null references public.orders(id) on delete cascade,
  rated_by    uuid        not null references public.profiles(id) on delete cascade,
  rater_role  text        not null check (rater_role in ('expediteur', 'destinataire')),
  score       integer     not null check (score between 1 and 5),
  comment     text,
  created_at  timestamptz default now(),
  unique (order_id, rater_role)
);

alter table public.delivery_ratings enable row level security;

-- L'expéditeur ne peut noter que ses propres livraisons terminées
create policy "client rates own livree orders"
  on public.delivery_ratings for insert
  with check (
    rated_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.status = 'livree'
        and o.client_id = auth.uid()
    )
  );

-- Chaque utilisateur peut lire les notes qu'il a émises
create policy "user reads own ratings"
  on public.delivery_ratings for select
  using (rated_by = auth.uid());

-- Le livreur peut lire toutes les notes reçues sur ses livraisons
create policy "driver reads ratings on own orders"
  on public.delivery_ratings for select
  using (
    exists (
      select 1 from public.orders o
      join public.drivers d on d.id = o.driver_id
      where o.id = order_id
        and d.profile_id = auth.uid()
    )
  );

-- L'admin peut tout lire
create policy "admin reads all ratings"
  on public.delivery_ratings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
