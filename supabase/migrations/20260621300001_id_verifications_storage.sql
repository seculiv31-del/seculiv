-- Bucket privé pour les photos de pièces d'identité (mode sensible)
insert into storage.buckets (id, name, public)
  values ('id-verifications', 'id-verifications', false)
  on conflict (id) do nothing;

-- Le livreur peut UPLOADER (insert) mais JAMAIS lire
create policy "livreur upload id verif" on storage.objects
  for insert with check (
    bucket_id = 'id-verifications' and auth.role() = 'authenticated'
  );
-- AUCUNE policy SELECT ici = personne ne lit via l'app.
-- Seul l'admin lira via une Edge Function dédiée (service_role), avec traçabilité.
