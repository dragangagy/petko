-- Petko: automatic cleanup for the working challenges table.
-- Run this in Supabase SQL Editor after supabase-schema.sql.
-- It keeps permanent scores in challenge_stats / challenge_score_stats,
-- while removing old challenge cards from public.challenges.

create extension if not exists pg_cron;

create or replace function public.cleanup_old_challenges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
  step_count integer := 0;
  belgrade_today date := (now() at time zone 'Europe/Belgrade')::date;
  dow integer := extract(isodow from belgrade_today)::integer;
  weekend_start date := belgrade_today - ((dow + 1) % 7);
begin
  -- Snapshot the current or last Witch Hunt while its cards still exist.
  -- Saturday = this weekend, Sunday/Monday-Friday = last Saturday.
  perform public.record_witch_hunt_result(weekend_start);

  -- Sent invite was never accepted. After 6h it expires, except Witch Hunt
  -- yellow cards which stay until Monday 00:00 Belgrade.
  delete from public.challenges
  where status = 'pending'
    and opponent_device is null
    and accepted_at is null
    and created_at < now() - interval '6 hours'
    and not (
      extract(isodow from (created_at at time zone 'Europe/Belgrade')) in (6, 7)
      and now() < (
        date_trunc('week', created_at at time zone 'Europe/Belgrade')
        + interval '7 days'
      ) at time zone 'Europe/Belgrade'
    );
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  -- Accepted challenge has a 24h play window. Witch Hunt green cards stay
  -- until Monday 00:00 Belgrade.
  delete from public.challenges
  where status = 'accepted'
    and coalesce(accepted_at, created_at) < now() - interval '24 hours'
    and not (
      extract(isodow from (created_at at time zone 'Europe/Belgrade')) in (6, 7)
      and now() < (
        date_trunc('week', created_at at time zone 'Europe/Belgrade')
        + interval '7 days'
      ) at time zone 'Europe/Belgrade'
    );
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  -- Blue result cards are visible 24h. Witch Hunt results stay until the next
  -- Saturday 00:00 Belgrade, so the scoreboard can show them all week.
  delete from public.challenges
  where status = 'played'
    and (
      case
        when extract(isodow from (created_at at time zone 'Europe/Belgrade')) in (6, 7)
          then now() >= (
            date_trunc('week', created_at at time zone 'Europe/Belgrade')
            + interval '12 days'
          ) at time zone 'Europe/Belgrade'
        else greatest(
          coalesce(creator_played_at, created_at),
          coalesce(opponent_played_at, created_at),
          coalesce(accepted_at, created_at),
          created_at
        ) < now() - interval '24 hours'
      end
    );
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  -- Cancelled cards do not need to stay visible for long.
  delete from public.challenges
  where status = 'cancelled'
    and created_at < now() - interval '1 hour';
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  return deleted_count;
end;
$$;

-- Re-create the job idempotently so running this file twice does not duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'petko_cleanup_old_challenges';

select cron.schedule(
  'petko_cleanup_old_challenges',
  '*/10 * * * *',
  $$select public.cleanup_old_challenges();$$
);
