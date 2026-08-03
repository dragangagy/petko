-- Petko: permanent Witch Hunt results, independent from temporary cards.

create table if not exists public.weekend_results (
  weekend_start date primary key,
  hunters integer not null default 0 check (hunters >= 0),
  witches integer not null default 0 check (witches >= 0),
  draws integer not null default 0 check (draws >= 0),
  unplayed integer not null default 0 check (unplayed >= 0),
  winner text not null default 'tie' check (winner in ('hunter', 'witch', 'tie')),
  finalized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.weekend_results enable row level security;
drop policy if exists "weekend_results_read" on public.weekend_results;
create policy "weekend_results_read" on public.weekend_results
  for select using (true);

create or replace function public.record_witch_hunt_result(p_weekend_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hunter_total integer := 0;
  witch_total integer := 0;
  draw_total integer := 0;
  unplayed_total integer := 0;
begin
  with weekend_cards as (
    select *
    from public.challenges
    where created_at >= (p_weekend_start::timestamp at time zone 'Europe/Belgrade')
      and created_at < ((p_weekend_start + 2)::timestamp at time zone 'Europe/Belgrade')
  ), completed as (
    select * from weekend_cards
    where status = 'played'
      and creator_played_at is not null
      and opponent_played_at is not null
  )
  select
    count(*) filter (where (creator_faction = 'witch' and opponent_faction = 'witch')
      or (creator_score > opponent_score and creator_faction = 'hunter')
      or (opponent_score > creator_score and opponent_faction = 'hunter')),
    count(*) filter (where not (creator_faction = 'witch' and opponent_faction = 'witch')
      and ((creator_score > opponent_score and creator_faction = 'witch')
        or (opponent_score > creator_score and opponent_faction = 'witch'))),
    count(*) filter (where not (creator_faction = 'witch' and opponent_faction = 'witch')
      and creator_score = opponent_score)
  into hunter_total, witch_total, draw_total
  from completed;

  select count(*) into unplayed_total
  from weekend_cards
  where status <> 'played'
     or creator_played_at is null
     or opponent_played_at is null;

  insert into public.weekend_results (weekend_start, hunters, witches, draws, unplayed, winner, finalized_at, updated_at)
  values (
    p_weekend_start,
    coalesce(hunter_total, 0),
    coalesce(witch_total, 0),
    coalesce(draw_total, 0),
    coalesce(unplayed_total, 0),
    case when hunter_total > witch_total then 'hunter' when witch_total > hunter_total then 'witch' else 'tie' end,
    now(), now()
  )
  on conflict (weekend_start) do update set
    hunters = excluded.hunters,
    witches = excluded.witches,
    draws = excluded.draws,
    unplayed = excluded.unplayed,
    winner = excluded.winner,
    finalized_at = excluded.finalized_at,
    updated_at = now();
end;
$$;

-- Restored result for the Witch Hunt that was cleared before archival existed.
insert into public.weekend_results (weekend_start, hunters, witches, draws, unplayed, winner, finalized_at)
values ('2026-08-01', 18, 8, 11, 3, 'hunter', now())
on conflict (weekend_start) do update set
  hunters = excluded.hunters,
  witches = excluded.witches,
  draws = excluded.draws,
  unplayed = excluded.unplayed,
  winner = excluded.winner,
  updated_at = now();
