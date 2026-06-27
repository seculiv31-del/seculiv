-- Correctif RLS orders : les livreurs doivent voir les courses disponibles
-- et leurs propres courses assignées.
-- On supprime d'abord les politiques existantes pour éviter les conflits.

-- 1. Politique : livreur voit les courses disponibles (en_attente, non assignées)
drop policy if exists "livreur voit les courses disponibles" on public.orders;
create policy "livreur voit les courses disponibles" on public.orders
  for select using (
    status = 'en_attente'
    and driver_id is null
    and (select role from public.profiles where id = auth.uid()) = 'driver'
  );

-- 2. Politique : livreur voit ses propres courses (toutes les courses qui lui sont assignées)
drop policy if exists "livreur voit ses propres courses" on public.orders;
create policy "livreur voit ses propres courses" on public.orders
  for select using (
    driver_id in (
      select id from public.drivers where profile_id = auth.uid()
    )
  );

-- 3. Politique : livreur peut mettre à jour une course disponible pour l'accepter
--    (uniquement si elle est encore en_attente et sans livreur assigné)
drop policy if exists "livreur accepte une course" on public.orders;
create policy "livreur accepte une course" on public.orders
  for update using (
    (select role from public.profiles where id = auth.uid()) = 'driver'
    and (
      -- Soit la course lui est déjà assignée
      driver_id in (select id from public.drivers where profile_id = auth.uid())
      -- Soit la course est disponible (pour l'acceptation initiale)
      or (status = 'en_attente' and driver_id is null)
    )
  );

-- 4. Politique : admin voit toutes les courses
drop policy if exists "admin voit toutes les commandes" on public.orders;
create policy "admin voit toutes les commandes" on public.orders
  for select using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- 5. Politique : client voit ses propres commandes
drop policy if exists "client voit ses commandes" on public.orders;
create policy "client voit ses commandes" on public.orders
  for select using (
    client_id = auth.uid()
  );

-- 6. Activer le Realtime sur la table orders pour que les livreurs
--    et l'admin reçoivent les mises à jour en temps réel.
--    (idempotent : l'ajout d'une table déjà présente est sans effet)
alter publication supabase_realtime add table public.orders;
