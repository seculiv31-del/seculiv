-- Correction FK orders.driver_id : NO ACTION → SET NULL
-- Quand un livreur est supprimé, ses commandes passent à driver_id = NULL
-- (non assignées) au lieu de bloquer la suppression.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_driver_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id)
  ON DELETE SET NULL;
