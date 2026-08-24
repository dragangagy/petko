-- Petko: permanent Witch Hunt results, independent from temporary cards.
-- Run this in the Supabase SQL editor. Safe to run more than once.

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
  window_start timestamptz := (p_weekend_start::timestamp at time zone 'Europe/Belgrade');
  window_end timestamptz := ((p_weekend_start + 2)::timestamp at time zone 'Europe/Belgrade');
  card_total integer := 0;
  hunter_total integer := 0;
  witch_total integer := 0;
  draw_total integer := 0;
  unplayed_total integer := 0;
  existing_points integer := 0;
begin
  if p_weekend_start is null then
    return;
  end if;

  select count(*) into card_total
  from public.challenges
  where created_at >= window_start
    and created_at < window_end;

  -- Cards already cleaned up: never replace an archived score with zeros.
  if coalesce(card_total, 0) = 0 then
    return;
  end if;

  select coalesce(hunters, 0) + coalesce(witches, 0) + coalesce(draws, 0)
  into existing_points
  from public.weekend_results
  where weekend_start = p_weekend_start;

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
  from public.challenges
  where created_at >= window_start
    and created_at < window_end
    and status = 'played'
    and creator_played_at is not null
    and opponent_played_at is not null;

  select count(*) into unplayed_total
  from public.challenges
  where created_at >= window_start
    and created_at < window_end
    and (
      status <> 'played'
      or creator_played_at is null
      or opponent_played_at is null
    );

  -- If finished games are already gone, keep the last real snapshot.
  if coalesce(hunter_total, 0) + coalesce(witch_total, 0) + coalesce(draw_total, 0) = 0
     and coalesce(existing_points, 0) > 0 then
    return;
  end if;

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

grant execute on function public.record_witch_hunt_result(date) to anon, authenticated;

-- Restored result for the Witch Hunt that was cleared before archival existed.
insert into public.weekend_results (weekend_start, hunters, witches, draws, unplayed, winner, finalized_at)
values ('2026-08-01', 18, 8, 11, 3, 'hunter', now())
on conflict (weekend_start) do nothing;
