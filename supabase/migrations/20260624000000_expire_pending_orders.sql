-- Cron job : annule les commandes "en_attente" non assignées depuis plus de 24h.
--
-- AVANT D'EXÉCUTER :
--   Exécute ce SQL dans Dashboard → SQL Editor (pas via supabase db query
--   car pg_cron n'est pas accessible depuis le rôle CLI).
--
-- pg_cron est pré-installé sur tous les projets Supabase hébergés.

select cron.schedule(
  'expire-pending-orders-hourly',       -- nom du job (unique)
  '0 * * * *',                          -- toutes les heures
  $$
    update orders
    set status = 'annulee'
    where status = 'en_attente'
      and created_at < now() - interval '24 hours';
  $$
);

-- Pour vérifier que le job est bien enregistré :
-- select * from cron.job;

-- Pour supprimer le job si besoin :
-- select cron.unschedule('expire-pending-orders-hourly');
