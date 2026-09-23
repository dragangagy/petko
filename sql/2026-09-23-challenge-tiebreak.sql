-- Challenge DRAW tiebreaker (Двобој) — run once in Adminer or Supabase SQL editor.
-- Column names must match app.js exactly: tiebreak_letters, tiebreak_status, etc.
-- After ALTER, PostgREST must reload schema or PATCH/SELECT on new columns fails until restart:
--   NOTIFY pgrst, 'reload schema';
-- (Supabase: Settings → API → reload schema, or restart PostgREST.)

alter table public.challenges
  add column if not exists tiebreak_status text,
  add column if not exists tiebreak_letters text,
  add column if not exists tiebreak_started_by text,
  add column if not exists tiebreak_started_at timestamptz,
  add column if not exists tiebreak_creator_word text,
  add column if not exists tiebreak_opponent_word text;
