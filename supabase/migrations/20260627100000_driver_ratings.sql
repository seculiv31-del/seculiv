-- Système de notation des livreurs par les clients expéditeurs.
-- trust_score = round(avg(rating) × 20)   →  5★ = 100, 0 notation = 0.

create table public.driver_ratings (
  id         uuid        primary key default gen_random_uuid(),
  order_id   uuid        not null references public.orders(id)   on delete cascade,
  driver_id  uuid        not null references public.drivers(id)  on delete cascade,
  rater_id   uuid        not null references public.profiles(id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  unique (order_id, rater_id)
);

create index on public.driver_ratings(driver_id);

alter table public.driver_ratings enable row level security;

-- Lecture libre (stats livreur, admin)
create policy ratings_lisibles on public.driver_ratings
  for select using (true);

-- Le client peut noter une commande livrée qu'il a créée (1 note par commande)
create policy client_peut_noter on public.driver_ratings
  for insert with check (
    rater_id = auth.uid()
    and exists (
      select 1 from public.orders
      where id    = order_id
        and client_id  = auth.uid()
        and status     = 'livree'
        and driver_id  is not null
    )
  );

-- Trigger : recalcule trust_score après chaque insert/update/delete
create or replace function public.recalc_trust_from_ratings()
returns trigger language plpgsql security definer as $$
declare
  v_driver_id uuid    := coalesce(new.driver_id, old.driver_id);
  v_avg       numeric;
  v_count     bigint;
begin
  select avg(rating)::numeric, count(*) into v_avg, v_count
  from   public.driver_ratings
  where  driver_id = v_driver_id;

  update public.drivers
  set    trust_score       = case when v_count = 0 then 0
                                  else round(v_avg * 20)::int end,
         last_score_update = now()
  where  id = v_driver_id;

  return coalesce(new, old);
end;
$$;

create trigger after_driver_rating
  after insert or update or delete on public.driver_ratings
  for each row execute function public.recalc_trust_from_ratings();

-- Remet à zéro les scores non justifiés (aucune notation réelle encore)
update public.drivers set trust_score = 0;
