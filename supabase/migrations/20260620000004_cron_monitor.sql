-- Cron job : appel monitor-trip toutes les 2 minutes via pg_cron + pg_net.
--
-- AVANT D'EXÉCUTER :
--   1. Dashboard Supabase → Settings → API → "service_role" key
--   2. Remplace <SERVICE_ROLE_KEY> ci-dessous par cette valeur.
--   3. Exécute ce SQL dans Dashboard → SQL Editor (pas via supabase db query
--      car pg_net n'est pas accessible depuis le rôle CLI).
--
-- pg_cron et pg_net sont pré-installés sur tous les projets Supabase hébergés.

select cron.schedule(
  'monitor-trip-every-2min',           -- nom du job (unique)
  '*/2 * * * *',                       -- toutes les 2 minutes
  $$
    select net.http_post(
      url     := 'https://mbvxcqrleexvsagditbg.supabase.co/functions/v1/monitor-trip',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Pour vérifier que le job est bien enregistré :
-- select * from cron.job;

-- Pour supprimer le job si besoin :
-- select cron.unschedule('monitor-trip-every-2min');
