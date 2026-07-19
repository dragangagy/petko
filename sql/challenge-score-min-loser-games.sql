-- Petko: strongest challenge score medal rule.
-- Run this in Supabase SQL Editor to apply the rule from now on:
-- a winning challenge score counts for "Najaci izazov skor" only when
-- the losing player has at least 10 played challenges in challenge_stats.

create or replace function public.challenge_player_total_games(player_name text)
returns integer
language sql
stable
as $$
  select coalesce(sum(total_games), 0)::integer
  from public.challenge_stats
  where lower(btrim(player_a)) = lower(btrim(coalesce(player_name, '')))
     or lower(btrim(player_b)) = lower(btrim(coalesce(player_name, '')))
$$;

create or replace function public.record_challenge_score_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  winner_name text;
  winner_score integer;
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
    winner_score := coalesce(new.creator_score, 0);
    loser_role := 'opponent';
    loser_name := btrim(new.opponent);
  else
    winner_name := btrim(new.opponent);
    winner_score := coalesce(new.opponent_score, 0);
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

drop trigger if exists challenges_score_stats_trigger on public.challenges;
create trigger challenges_score_stats_trigger
after update on public.challenges
for each row execute function public.record_challenge_score_stats();
