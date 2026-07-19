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
begin
  -- Sent invite was never accepted. After 6h it expires and the attempt returns in the app.
  delete from public.challenges
  where status = 'pending'
    and opponent_device is null
    and accepted_at is null
    and created_at < now() - interval '6 hours';
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  -- Accepted challenge has a 24h play window. After that it is no longer an active card.
  delete from public.challenges
  where status = 'accepted'
    and coalesce(accepted_at, created_at) < now() - interval '24 hours';
  get diagnostics step_count = row_count;
  deleted_count := deleted_count + step_count;

  -- Finished result cards are kept briefly so players can see them, then removed.
  delete from public.challenges
  where status = 'played'
    and greatest(
      coalesce(creator_played_at, created_at),
      coalesce(opponent_played_at, created_at),
      coalesce(accepted_at, created_at),
      created_at
    ) < now() - interval '24 hours';
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
