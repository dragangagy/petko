-- Challenge DRAW tiebreaker columns (Adminer / Supabase SQL)
alter table public.challenges
  add column if not exists tiebreak_status text,
  add column if not exists tiebreak_letters text,
  add column if not exists tiebreak_started_by text,
  add column if not exists tiebreak_started_at timestamptz,
  add column if not exists tiebreak_creator_word text,
  add column if not exists tiebreak_opponent_word text;
