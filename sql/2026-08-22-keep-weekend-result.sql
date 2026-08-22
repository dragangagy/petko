-- Petko: keep the Witch Hunt score for that weekend.
-- cleanup_old_challenges() runs every 10 minutes. On Monday it archives the
-- result, then deletes weekend cards. The next runs used to upsert 0-0 over
-- the real weekly score. Skip the write when cards for that weekend are gone.

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
  from public.challenges
  where created_at >= (p_weekend_start::timestamp at time zone 'Europe/Belgrade')
    and created_at < ((p_weekend_start + 2)::timestamp at time zone 'Europe/Belgrade')
    and (
      status <> 'played'
      or creator_played_at is null
      or opponent_played_at is null
    );

  if not exists (
    select 1
    from public.challenges
    where created_at >= (p_weekend_start::timestamp at time zone 'Europe/Belgrade')
      and created_at < ((p_weekend_start + 2)::timestamp at time zone 'Europe/Belgrade')
  ) then
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
