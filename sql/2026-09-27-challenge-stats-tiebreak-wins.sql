-- Petko: победа у двобоју се рачуна у challenge_stats.
--
-- Главна партија завршена нерешено уписује се као draws + 1 (record_finished_challenge_stats).
-- Кад двобој добије победника (tiebreak_status први пут постане 'done'), овај тригер
-- пребацује тај изазов из нерешених у победе: draws - 1, победник wins + 1.
-- total_games и остале колоне се не мењају.
--
-- Победник се одређује исто као challengeTiebreakWinnerRole у app.js:
--   1) предала само једна страна ('__FORFEIT__') — побеђује друга;
--   2) дужа реч побеђује (празна реч = 0 слова, предаја = -1);
--   3) иста дужина, обе речи непразне и различите — побеђује реч која је касније
--      по српској азбуци (localeCompare 'sr');
--   4) иначе остаје нерешено и ништа се не мења.
--
-- Бројање креће од тренутка када се скрипта покрене; ранији двобоји се не прерачунавају.
-- Безбедно је покренути више пута.
-- Покреће се ручно у Adminer-у као postgres.

begin;

create or replace function public.challenge_tiebreak_sort_key(word text)
returns text
language sql
immutable
as $$
  select translate(
    lower(coalesce(word, '')),
    'абвгдђежзијклљмнњопрстћуфхцчџш',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcd'
  );
$$;

create or replace function public.record_tiebreak_challenge_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  forfeit_marker constant text := '__FORFEIT__';
  creator_name text;
  opponent_name text;
  a text;
  creator_is_a boolean;
  c_word text;
  o_word text;
  c_forfeit boolean;
  o_forfeit boolean;
  c_len integer;
  o_len integer;
  winner text := null;
  winner_is_a boolean;
begin
  if lower(coalesce(new.tiebreak_status, '')) <> 'done'
    or lower(coalesce(old.tiebreak_status, '')) = 'done'
  then
    return new;
  end if;

  if new.creator_played_at is null or new.opponent_played_at is null then
    return new;
  end if;

  if coalesce(new.creator_score, 0) <> coalesce(new.opponent_score, 0) then
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

  c_word := new.tiebreak_creator_word;
  o_word := new.tiebreak_opponent_word;
  c_forfeit := coalesce(c_word, '') = forfeit_marker;
  o_forfeit := coalesce(o_word, '') = forfeit_marker;

  if c_forfeit <> o_forfeit then
    winner := case when c_forfeit then 'opponent' else 'creator' end;
  elsif c_word is not null and o_word is not null then
    c_len := case when c_forfeit then -1 else char_length(c_word) end;
    o_len := case when o_forfeit then -1 else char_length(o_word) end;
    if c_len > o_len then
      winner := 'creator';
    elsif o_len > c_len then
      winner := 'opponent';
    elsif c_len > 0 and lower(c_word) <> lower(o_word) then
      winner := case
        when public.challenge_tiebreak_sort_key(c_word) collate "C"
           > public.challenge_tiebreak_sort_key(o_word) collate "C"
          then 'creator'
        else 'opponent'
      end;
    end if;
  end if;

  if winner is null then
    return new;
  end if;

  a := public.challenge_canonical_name(public.challenge_pair_player_a(creator_name, opponent_name));
  creator_is_a := lower(creator_name) = lower(a);
  winner_is_a := (winner = 'creator') = creator_is_a;

  update public.challenge_stats set
    draws = draws - 1,
    player_a_wins = player_a_wins + case when winner_is_a then 1 else 0 end,
    player_b_wins = player_b_wins + case when winner_is_a then 0 else 1 end,
    updated_at = now()
  where player_a = a
    and player_b = public.challenge_canonical_name(public.challenge_pair_player_b(creator_name, opponent_name))
    and draws > 0;

  return new;
end;
$$;

drop trigger if exists challenges_tiebreak_stats_trigger on public.challenges;
create trigger challenges_tiebreak_stats_trigger
after update on public.challenges
for each row execute function public.record_tiebreak_challenge_stats();

commit;

notify pgrst, 'reload schema';
