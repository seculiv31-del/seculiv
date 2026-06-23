-- Création du bucket privé pour les photos de livraison
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', false)
on conflict (id) do nothing;

-- Livreur peut uploader dans le dossier orders/ de son bucket
create policy "livreur upload ses photos" on storage.objects
  for insert with check (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'orders'
  );

-- Client et admin authentifiés peuvent lire les photos
create policy "client lit ses photos" on storage.objects
  for select using (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
  );
