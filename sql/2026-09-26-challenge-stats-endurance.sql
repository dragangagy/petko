-- Petko: трајна Издржљивост и Прецизност у challenge_stats.
--
-- Додаје у public.challenge_stats, за сваку страну пара (a и b):
--   *_finished      — одиграо своју страну и није предао,
--   *_surrenders    — предао главну партију или двобој,
--   *_forfeits      — није одиграо пре истека (аутоматски пораз),
--   *_solved_sum    — збир решених табли (0–6) у партијама које је одиграо без предаје,
--   *_solved_games  — број партија урачунатих у *_solved_sum.
-- Тригер record_finished_challenge_stats задржава сво постојеће бројање
-- (победе, нерешене, послате, total_games, last_played_at) и уз то пуни нове колоне.
--
-- Бројање креће од тренутка када се ова скрипта покрене; старе партије се не прерачунавају
-- (нове колоне почињу од 0).
-- Безбедно је покренути више пута: колоне се додају само ако не постоје,
-- а функција и тригер се само замене истом дефиницијом.
--
-- Покреће се ручно у Adminer-у као postgres.

begin;

alter table public.challenge_stats
  add column if not exists player_a_finished integer not null default 0,
  add column if not exists player_b_finished integer not null default 0,
  add column if not exists player_a_surrenders integer not null default 0,
  add column if not exists player_b_surrenders integer not null default 0,
  add column if not exists player_a_forfeits integer not null default 0,
  add column if not exists player_b_forfeits integer not null default 0,
  add column if not exists player_a_solved_sum integer not null default 0,
  add column if not exists player_b_solved_sum integer not null default 0,
  add column if not exists player_a_solved_games integer not null default 0,
  add column if not exists player_b_solved_games integer not null default 0;

-- Три догађаја, сваки се броји само једном:
--   1) обе стране први пут имају *_played_at (постојећи услов) — победе/нерешено/послато
--      као и до сада, плус finished/surrenders/solved за обе стране;
--   2) истекао изазов: status први пут прелази у 'played' док је одиграла само једна страна
--      (finalizeExpiredChallenges) — одиграна страна finished/surrender/solved, друга forfeit;
--      ажурира се само постојећи ред пара, победе и total_games се не мењају (као и до сада);
--   3) tiebreak_*_word први пут постаје '__FORFEIT__' после већ урачунате главне партије —
--      та страна прелази из finished у surrenders.
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
  main_event boolean;
  forfeit_event boolean;
  tiebreak_event boolean;
  creator_is_a boolean;
  new_row jsonb := to_jsonb(new);
  old_row jsonb := to_jsonb(old);
  forfeit_marker constant text := '__FORFEIT__';
  creator_played boolean;
  opponent_played boolean;
  creator_surrendered boolean;
  opponent_surrendered boolean;
  creator_tb_forfeit boolean;
  opponent_tb_forfeit boolean;
  creator_tb_forfeit_new boolean;
  opponent_tb_forfeit_new boolean;
  c_finished integer := 0;
  c_surrenders integer := 0;
  c_forfeits integer := 0;
  c_solved_sum integer := 0;
  c_solved_games integer := 0;
  o_finished integer := 0;
  o_surrenders integer := 0;
  o_forfeits integer := 0;
  o_solved_sum integer := 0;
  o_solved_games integer := 0;
  a_finished_delta integer := 0;
  b_finished_delta integer := 0;
  a_surrenders_delta integer := 0;
  b_surrenders_delta integer := 0;
  a_forfeits_delta integer := 0;
  b_forfeits_delta integer := 0;
  a_solved_sum_delta integer := 0;
  b_solved_sum_delta integer := 0;
  a_solved_games_delta integer := 0;
  b_solved_games_delta integer := 0;
begin
  creator_played := new.creator_played_at is not null;
  opponent_played := new.opponent_played_at is not null;

  main_event := creator_played
    and opponent_played
    and not (old.creator_played_at is not null and old.opponent_played_at is not null);

  forfeit_event := not main_event
    and creator_played <> opponent_played
    and lower(coalesce(new.status, '')) = 'played'
    and lower(coalesce(old.status, '')) is distinct from 'played';

  creator_tb_forfeit := coalesce(new_row->>'tiebreak_creator_word', '') = forfeit_marker;
  opponent_tb_forfeit := coalesce(new_row->>'tiebreak_opponent_word', '') = forfeit_marker;
  creator_tb_forfeit_new := creator_tb_forfeit
    and coalesce(old_row->>'tiebreak_creator_word', '') <> forfeit_marker;
  opponent_tb_forfeit_new := opponent_tb_forfeit
    and coalesce(old_row->>'tiebreak_opponent_word', '') <> forfeit_marker;

  tiebreak_event := not main_event
    and creator_played
    and opponent_played
    and old.creator_played_at is not null
    and old.opponent_played_at is not null
    and (creator_tb_forfeit_new or opponent_tb_forfeit_new);

  if not (main_event or forfeit_event or tiebreak_event) then
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
  creator_is_a := lower(creator_name) = lower(a);

  -- Предаја главне партије: страна има played_at, а 0 покушаја (surrenderChallenge).
  creator_surrendered := creator_played and coalesce(new.creator_attempts, 0) = 0;
  opponent_surrendered := opponent_played and coalesce(new.opponent_attempts, 0) = 0;

  if main_event or forfeit_event then
    if creator_played then
      if creator_surrendered or creator_tb_forfeit then
        c_surrenders := 1;
      else
        c_finished := 1;
      end if;
      if not creator_surrendered then
        c_solved_sum := least(6, greatest(0, coalesce(new.creator_solved, 0)));
        c_solved_games := 1;
      end if;
    else
      c_forfeits := 1;
    end if;

    if opponent_played then
      if opponent_surrendered or opponent_tb_forfeit then
        o_surrenders := 1;
      else
        o_finished := 1;
      end if;
      if not opponent_surrendered then
        o_solved_sum := least(6, greatest(0, coalesce(new.opponent_solved, 0)));
        o_solved_games := 1;
      end if;
    else
      o_forfeits := 1;
    end if;
  end if;

  if creator_is_a then
    a_finished_delta := c_finished;
    a_surrenders_delta := c_surrenders;
    a_forfeits_delta := c_forfeits;
    a_solved_sum_delta := c_solved_sum;
    a_solved_games_delta := c_solved_games;
    b_finished_delta := o_finished;
    b_surrenders_delta := o_surrenders;
    b_forfeits_delta := o_forfeits;
    b_solved_sum_delta := o_solved_sum;
    b_solved_games_delta := o_solved_games;
  else
    a_finished_delta := o_finished;
    a_surrenders_delta := o_surrenders;
    a_forfeits_delta := o_forfeits;
    a_solved_sum_delta := o_solved_sum;
    a_solved_games_delta := o_solved_games;
    b_finished_delta := c_finished;
    b_surrenders_delta := c_surrenders;
    b_forfeits_delta := c_forfeits;
    b_solved_sum_delta := c_solved_sum;
    b_solved_games_delta := c_solved_games;
  end if;

  if main_event then
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
      updated_at,
      player_a_finished,
      player_b_finished,
      player_a_surrenders,
      player_b_surrenders,
      player_a_forfeits,
      player_b_forfeits,
      player_a_solved_sum,
      player_b_solved_sum,
      player_a_solved_games,
      player_b_solved_games
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
      now(),
      a_finished_delta,
      b_finished_delta,
      a_surrenders_delta,
      b_surrenders_delta,
      a_forfeits_delta,
      b_forfeits_delta,
      a_solved_sum_delta,
      b_solved_sum_delta,
      a_solved_games_delta,
      b_solved_games_delta
    )
    on conflict (player_a, player_b) do update set
      player_a_wins = public.challenge_stats.player_a_wins + excluded.player_a_wins,
      player_b_wins = public.challenge_stats.player_b_wins + excluded.player_b_wins,
      draws = public.challenge_stats.draws + excluded.draws,
      player_a_sent = public.challenge_stats.player_a_sent + excluded.player_a_sent,
      player_b_sent = public.challenge_stats.player_b_sent + excluded.player_b_sent,
      total_games = public.challenge_stats.total_games + 1,
      last_played_at = greatest(public.challenge_stats.last_played_at, excluded.last_played_at),
      updated_at = now(),
      player_a_finished = public.challenge_stats.player_a_finished + excluded.player_a_finished,
      player_b_finished = public.challenge_stats.player_b_finished + excluded.player_b_finished,
      player_a_surrenders = public.challenge_stats.player_a_surrenders + excluded.player_a_surrenders,
      player_b_surrenders = public.challenge_stats.player_b_surrenders + excluded.player_b_surrenders,
      player_a_forfeits = public.challenge_stats.player_a_forfeits + excluded.player_a_forfeits,
      player_b_forfeits = public.challenge_stats.player_b_forfeits + excluded.player_b_forfeits,
      player_a_solved_sum = public.challenge_stats.player_a_solved_sum + excluded.player_a_solved_sum,
      player_b_solved_sum = public.challenge_stats.player_b_solved_sum + excluded.player_b_solved_sum,
      player_a_solved_games = public.challenge_stats.player_a_solved_games + excluded.player_a_solved_games,
      player_b_solved_games = public.challenge_stats.player_b_solved_games + excluded.player_b_solved_games;

    return new;
  end if;

  if forfeit_event then
    update public.challenge_stats set
      player_a_finished = player_a_finished + a_finished_delta,
      player_b_finished = player_b_finished + b_finished_delta,
      player_a_surrenders = player_a_surrenders + a_surrenders_delta,
      player_b_surrenders = player_b_surrenders + b_surrenders_delta,
      player_a_forfeits = player_a_forfeits + a_forfeits_delta,
      player_b_forfeits = player_b_forfeits + b_forfeits_delta,
      player_a_solved_sum = player_a_solved_sum + a_solved_sum_delta,
      player_b_solved_sum = player_b_solved_sum + b_solved_sum_delta,
      player_a_solved_games = player_a_solved_games + a_solved_games_delta,
      player_b_solved_games = player_b_solved_games + b_solved_games_delta
    where player_a = a and player_b = b;

    return new;
  end if;

  -- tiebreak_event: предаја двобоја после већ урачунате главне партије.
  update public.challenge_stats set
    player_a_finished = case
      when (creator_is_a and creator_tb_forfeit_new) or (not creator_is_a and opponent_tb_forfeit_new)
        then greatest(player_a_finished - 1, 0)
      else player_a_finished
    end,
    player_a_surrenders = case
      when (creator_is_a and creator_tb_forfeit_new) or (not creator_is_a and opponent_tb_forfeit_new)
        then player_a_surrenders + 1
      else player_a_surrenders
    end,
    player_b_finished = case
      when (creator_is_a and opponent_tb_forfeit_new) or (not creator_is_a and creator_tb_forfeit_new)
        then greatest(player_b_finished - 1, 0)
      else player_b_finished
    end,
    player_b_surrenders = case
      when (creator_is_a and opponent_tb_forfeit_new) or (not creator_is_a and creator_tb_forfeit_new)
        then player_b_surrenders + 1
      else player_b_surrenders
    end
  where player_a = a and player_b = b;

  return new;
end;
$$;

drop trigger if exists challenges_finished_stats_trigger on public.challenges;
create trigger challenges_finished_stats_trigger
after update on public.challenges
for each row execute function public.record_finished_challenge_stats();

commit;

notify pgrst, 'reload schema';
