-- Merge case-insensitive duplicate challenge pairs and score stats,
-- drop invalid strongest-score rows, and canonicalize future writes.

begin;

create or replace function public.challenge_canonical_name(raw_name text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  clean text := btrim(coalesce(raw_name, ''));
  found text;
begin
  if clean = '' then
    return clean;
  end if;

  select css.nickname
  into found
  from public.challenge_score_stats css
  where lower(btrim(css.nickname)) = lower(clean)
  order by css.best_score desc, css.updated_at desc
  limit 1;
  if found is not null then
    return found;
  end if;

  select cs.player_a
  into found
  from public.challenge_stats cs
  where lower(btrim(cs.player_a)) = lower(clean)
  order by cs.total_games desc, cs.updated_at desc
  limit 1;
  if found is not null then
    return found;
  end if;

  select cs.player_b
  into found
  from public.challenge_stats cs
  where lower(btrim(cs.player_b)) = lower(clean)
  order by cs.total_games desc, cs.updated_at desc
  limit 1;
  if found is not null then
    return found;
  end if;

  return clean;
end;
$$;

-- 1) Merge duplicate challenge_stats rows (case-insensitive pair key)
create temp table merged_challenge_stats as
with normalized as (
  select
    id,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then btrim(player_a)
      else btrim(player_b)
    end as raw_a,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then btrim(player_b)
      else btrim(player_a)
    end as raw_b,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then player_a_wins
      else player_b_wins
    end as norm_a_wins,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then player_b_wins
      else player_a_wins
    end as norm_b_wins,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then player_a_sent
      else player_b_sent
    end as norm_a_sent,
    case
      when lower(btrim(player_a)) <= lower(btrim(player_b)) then player_b_sent
      else player_a_sent
    end as norm_b_sent,
    draws,
    total_games,
    last_played_at,
    updated_at
  from public.challenge_stats
),
grouped as (
  select
    lower(raw_a) as key_a,
    lower(raw_b) as key_b,
    (array_agg(raw_a order by total_games desc, updated_at desc))[1] as player_a,
    (array_agg(raw_b order by total_games desc, updated_at desc))[1] as player_b,
    sum(norm_a_wins)::integer as player_a_wins,
    sum(norm_b_wins)::integer as player_b_wins,
    sum(draws)::integer as draws,
    sum(norm_a_sent)::integer as player_a_sent,
    sum(norm_b_sent)::integer as player_b_sent,
    sum(total_games)::integer as total_games,
    max(last_played_at) as last_played_at,
    max(updated_at) as updated_at
  from normalized
  group by lower(raw_a), lower(raw_b)
)
select
  public.challenge_canonical_name(player_a) as player_a,
  public.challenge_canonical_name(player_b) as player_b,
  player_a_wins,
  player_b_wins,
  draws,
  player_a_sent,
  player_b_sent,
  total_games,
  last_played_at,
  updated_at
from grouped;

delete from public.challenge_stats;

insert into public.challenge_stats (
  player_a,
  player_b,
  player_a_wins,
  player_b_wins,
  draws,
  player_a_sent,
  player_b_sent,
  total_games,
  last_played_at,
  updated_at
)
select
  player_a,
  player_b,
  player_a_wins,
  player_b_wins,
  draws,
  player_a_sent,
  player_b_sent,
  total_games,
  last_played_at,
  coalesce(updated_at, now())
from merged_challenge_stats;

-- 2) Merge duplicate challenge_score_stats rows and drop winners with <10 total games
create temp table merged_challenge_score_stats as
with grouped as (
  select
    lower(btrim(nickname)) as key_name,
    (array_agg(btrim(nickname) order by best_score desc, best_score_count desc, updated_at desc))[1] as nickname,
    max(best_score)::integer as best_score,
    sum(
      case
        when best_score = max(best_score) over (partition by lower(btrim(nickname))) then best_score_count
        else 0
      end
    )::integer as best_score_count,
    max(last_at) as last_at,
    max(updated_at) as updated_at
  from public.challenge_score_stats
  group by lower(btrim(nickname))
)
select
  public.challenge_canonical_name(nickname) as nickname,
  best_score,
  greatest(best_score_count, 1) as best_score_count,
  last_at,
  updated_at
from grouped
where public.challenge_player_total_games(
  public.challenge_canonical_name(nickname)
) >= 10;

delete from public.challenge_score_stats;

insert into public.challenge_score_stats (
  nickname,
  best_score,
  best_score_count,
  last_at,
  updated_at
)
select
  nickname,
  best_score,
  best_score_count,
  last_at,
  coalesce(updated_at, now())
from merged_challenge_score_stats;

-- 3) Future writes: canonicalize names before upsert
create or replace function public.record_finished_challenge_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a text;
  b text;
  creator_name text;
  opponent_name text;
  creator_score_value integer;
  opponent_score_value integer;
  a_win_delta integer := 0;
  b_win_delta integer := 0;
  draw_delta integer := 0;
  a_sent_delta integer := 0;
  b_sent_delta integer := 0;
  played_at_value timestamptz;
begin
  if new.creator_played_at is null
    or new.opponent_played_at is null
    or (old.creator_played_at is not null and old.opponent_played_at is not null)
  then
    return new;
  end if;

  creator_name := btrim(coalesce(new.creator, ''));
  opponent_name := btrim(coalesce(new.opponent, ''));

  if creator_name = ''
    or opponent_name = ''
    or lower(opponent_name) in (lower('Нови корисник'), lower('Чека се'))
    or lower(creator_name) = lower(opponent_name)
  then
    return new;
  end if;

  a := public.challenge_canonical_name(public.challenge_pair_player_a(creator_name, opponent_name));
  b := public.challenge_canonical_name(public.challenge_pair_player_b(creator_name, opponent_name));
  creator_score_value := coalesce(new.creator_score, 0);
  opponent_score_value := coalesce(new.opponent_score, 0);
  played_at_value := greatest(new.creator_played_at, new.opponent_played_at);

  if creator_score_value = opponent_score_value then
    draw_delta := 1;
  elsif creator_score_value > opponent_score_value then
    if lower(creator_name) = lower(a) then
      a_win_delta := 1;
    else
      b_win_delta := 1;
    end if;
  else
    if lower(opponent_name) = lower(a) then
      a_win_delta := 1;
    else
      b_win_delta := 1;
    end if;
  end if;

  if lower(creator_name) = lower(a) then
    a_sent_delta := 1;
  else
    b_sent_delta := 1;
  end if;

  insert into public.challenge_stats (
    player_a,
    player_b,
    player_a_wins,
    player_b_wins,
    draws,
    player_a_sent,
    player_b_sent,
    total_games,
    last_played_at,
    updated_at
  ) values (
    a,
    b,
    a_win_delta,
    b_win_delta,
    draw_delta,
    a_sent_delta,
    b_sent_delta,
    1,
    played_at_value,
    now()
  )
  on conflict (player_a, player_b) do update set
    player_a_wins = public.challenge_stats.player_a_wins + excluded.player_a_wins,
    player_b_wins = public.challenge_stats.player_b_wins + excluded.player_b_wins,
    draws = public.challenge_stats.draws + excluded.draws,
    player_a_sent = public.challenge_stats.player_a_sent + excluded.player_a_sent,
    player_b_sent = public.challenge_stats.player_b_sent + excluded.player_b_sent,
    total_games = public.challenge_stats.total_games + 1,
    last_played_at = greatest(public.challenge_stats.last_played_at, excluded.last_played_at),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.record_challenge_score_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  winner_name text;
  loser_role text;
  loser_name text;
  loser_solved integer;
  loser_attempts integer;
  diff_value integer;
  played_at_value timestamptz;
begin
  if new.creator_played_at is null
    or new.opponent_played_at is null
    or (old.creator_played_at is not null and old.opponent_played_at is not null)
  then
    return new;
  end if;

  if btrim(coalesce(new.creator, '')) = ''
    or btrim(coalesce(new.opponent, '')) = ''
    or lower(btrim(new.opponent)) in (lower('Нови корисник'), lower('Чека се'))
    or lower(btrim(new.creator)) = lower(btrim(new.opponent))
  then
    return new;
  end if;

  if coalesce(new.creator_score, 0) = coalesce(new.opponent_score, 0) then
    return new;
  elsif coalesce(new.creator_score, 0) > coalesce(new.opponent_score, 0) then
    winner_name := btrim(new.creator);
    loser_role := 'opponent';
    loser_name := btrim(new.opponent);
  else
    winner_name := btrim(new.opponent);
    loser_role := 'creator';
    loser_name := btrim(new.creator);
  end if;

  if loser_role = 'creator' then
    loser_solved := coalesce(new.creator_solved, 0);
    loser_attempts := coalesce(new.creator_attempts, 0);
  else
    loser_solved := coalesce(new.opponent_solved, 0);
    loser_attempts := coalesce(new.opponent_attempts, 0);
  end if;

  if loser_solved < 6 and loser_attempts < 11 then
    return new;
  end if;

  winner_name := public.challenge_canonical_name(winner_name);
  loser_name := public.challenge_canonical_name(loser_name);

  if public.challenge_player_total_games(loser_name) < 10 then
    return new;
  end if;

  diff_value := abs(coalesce(new.creator_score, 0) - coalesce(new.opponent_score, 0));
  played_at_value := greatest(new.creator_played_at, new.opponent_played_at);

  insert into public.challenge_score_stats (
    nickname,
    best_score,
    best_score_count,
    last_at,
    updated_at
  ) values (
    winner_name,
    diff_value,
    1,
    played_at_value,
    now()
  )
  on conflict (nickname) do update set
    best_score = greatest(public.challenge_score_stats.best_score, excluded.best_score),
    best_score_count = case
      when excluded.best_score > public.challenge_score_stats.best_score then 1
      when excluded.best_score = public.challenge_score_stats.best_score then public.challenge_score_stats.best_score_count + 1
      else public.challenge_score_stats.best_score_count
    end,
    last_at = greatest(public.challenge_score_stats.last_at, excluded.last_at),
    updated_at = now();

  return new;
end;
$$;

commit;
