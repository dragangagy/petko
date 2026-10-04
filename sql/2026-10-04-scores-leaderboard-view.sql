-- Jedan red po igraču za takmičarsku listu i medalje.
-- Dan = najbolji dnevni rezultat igrača po beogradskom vremenu (isto kao scoreDate u app.js).
create or replace view public.scores_leaderboard as
with named as (
  select
    coalesce(nullif(btrim(nickname), ''), 'Играч') as nickname,
    lower(coalesce(nullif(btrim(nickname), ''), 'Играч')) as player_key,
    (created_at at time zone 'Europe/Belgrade')::date as day,
    score, wins, streak, created_at
  from public.scores
),
daily as (
  select distinct on (player_key, day) player_key, day, score, wins, streak, created_at
  from named
  order by player_key, day, score desc, created_at desc
),
latest_name as (
  select distinct on (player_key) player_key, nickname, created_at as last_at
  from named
  order by player_key, created_at desc
),
best_day as (
  select distinct on (player_key) player_key, score as best_score, created_at as best_at
  from daily
  order by player_key, score desc, created_at desc
)
select
  n.nickname,
  count(*)::integer as played_days,
  sum(d.score)::integer as total_score,
  b.best_score,
  b.best_at,
  max(d.streak)::integer as max_streak,
  sum(d.wins)::integer as wins,
  n.last_at
from daily d
join latest_name n using (player_key)
join best_day b using (player_key)
group by n.nickname, b.best_score, b.best_at, n.last_at;

grant select on public.scores_leaderboard to anon;

notify pgrst, 'reload schema';
