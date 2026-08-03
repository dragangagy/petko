-- Petko: non-destructive organization for faster and more reliable reads.
-- Run once in Supabase SQL Editor. It does not delete or rename any data.

-- Every challenge gets an auditable last-update timestamp. This makes it clear
-- which row is the newest when inspecting or reconciling a result.
alter table public.challenges
  add column if not exists updated_at timestamptz not null default now();

update public.challenges
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.touch_challenge_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists challenges_touch_updated_at on public.challenges;
create trigger challenges_touch_updated_at
before update on public.challenges
for each row execute function public.touch_challenge_updated_at();

-- These indexes match the reads used by the app: newest cards, active/pending
-- cards for a device, and weekend/day score calculations.
create index if not exists challenges_created_at_desc_idx
  on public.challenges (created_at desc);
create index if not exists challenges_status_created_at_idx
  on public.challenges (status, created_at desc);
create index if not exists challenges_creator_device_status_idx
  on public.challenges (creator_device, status, created_at desc);
create index if not exists challenges_opponent_device_status_idx
  on public.challenges (opponent_device, status, created_at desc);
create index if not exists challenges_day_created_at_idx
  on public.challenges (day, created_at desc);
create index if not exists challenges_code_idx
  on public.challenges (code);
create index if not exists players_nickname_idx
  on public.players (lower(nickname));
create index if not exists players_device_id_idx
  on public.players (device_id);

-- Read-only admin views: use these in Table Editor / SQL instead of manually
-- reconstructing the state from raw columns.
create or replace view public.challenge_overview as
select
  c.code,
  c.status,
  c.day,
  c.created_at,
  c.accepted_at,
  c.updated_at,
  c.creator,
  c.creator_device,
  c.creator_faction,
  c.creator_score,
  c.creator_solved,
  c.creator_played_at,
  c.opponent,
  c.opponent_device,
  c.opponent_faction,
  c.opponent_score,
  c.opponent_solved,
  c.opponent_played_at,
  case
    when c.creator_played_at is not null and c.opponent_played_at is not null then 'finished'
    when c.status = 'accepted' then 'active'
    when c.status = 'pending' then 'waiting'
    else coalesce(c.status, 'unknown')
  end as card_state
from public.challenges c;

create or replace view public.player_overview as
select
  p.nickname,
  p.device_id,
  p.avatar_id,
  p.weekend_avatar_id,
  p.weekend_avatar_weekend,
  p.challenge_bonus,
  p.created_at
from public.players p;

comment on view public.challenge_overview is
  'Petko admin pregled: jedna citljiva vrsta po izazovu, sa stabilnim stanjem kartice.';
comment on view public.player_overview is
  'Petko admin pregled: registracija, osnovni avatar i vikend avatar igraca.';
