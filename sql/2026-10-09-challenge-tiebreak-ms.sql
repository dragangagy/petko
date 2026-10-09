-- Vreme (ms od početka slaganja do potvrde) za dvoboj; kod istog broja slova pobeđuje brži.
alter table public.challenges
  add column if not exists tiebreak_creator_ms integer,
  add column if not exists tiebreak_opponent_ms integer;

notify pgrst, 'reload schema';
