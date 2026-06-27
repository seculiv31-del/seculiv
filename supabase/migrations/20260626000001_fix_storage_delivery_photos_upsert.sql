-- Correctif : la policy INSERT seule ne suffit pas quand upsert:true est utilisé.
-- Supabase Storage a besoin d'une policy UPDATE pour les re-prises de photo.
-- On recrée aussi INSERT idempotent pour s'assurer qu'elle est bien appliquée.

drop policy if exists "livreur upload ses photos" on storage.objects;
create policy "livreur upload ses photos" on storage.objects
  for insert with check (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'orders'
  );

drop policy if exists "livreur update ses photos" on storage.objects;
create policy "livreur update ses photos" on storage.objects
  for update using (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'orders'
  ) with check (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'orders'
  );

drop policy if exists "client lit ses photos" on storage.objects;
create policy "client lit ses photos" on storage.objects
  for select using (
    bucket_id = 'delivery-photos'
    and auth.role() = 'authenticated'
  );
