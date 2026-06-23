-- Ajoute un flag enabled pour activer/désactiver chaque règle de détection sans la supprimer.
ALTER TABLE public.monitoring_config
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
