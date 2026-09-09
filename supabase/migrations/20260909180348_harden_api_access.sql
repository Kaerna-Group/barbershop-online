-- Explicit Data API access for a new Supabase project and supporting indexes.
-- All table access remains constrained by the grants and RLS policies created
-- in the preceding migrations.

grant usage on schema public to anon, authenticated, service_role;

create index calendar_entries_service_id_fk_idx
  on public.calendar_entries (service_id)
  where service_id is not null;

create index calendar_entries_user_id_fk_idx
  on public.calendar_entries (user_id)
  where user_id is not null;

create index booking_actions_calendar_entry_id_fk_idx
  on public.booking_actions (calendar_entry_id)
  where calendar_entry_id is not null;

-- Execution is granted only to service_role below, so the deprecated auth.role()
-- check is unnecessary and would couple the worker to an obsolete helper.
create or replace function public.claim_notification_jobs(p_limit integer default 20)
returns table (
  id uuid,
  calendar_entry_id uuid,
  event_type text,
  booking_version integer,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.notification_jobs job
    where job.scheduled_for <= now()
      and (
        job.status in ('pending', 'failed')
        or (
          job.status = 'processing'
          and job.locked_at < now() - interval '10 minutes'
        )
      )
      and job.attempt_count < 5
    order by job.scheduled_for
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.notification_jobs job
  set
    status = 'processing',
    locked_at = now(),
    attempt_count = job.attempt_count + 1
  from candidates
  where job.id = candidates.id
  returning
    job.id,
    job.calendar_entry_id,
    job.event_type,
    job.booking_version,
    job.attempt_count;
end;
$$;

revoke all on function public.claim_notification_jobs(integer)
from public, anon, authenticated;

grant execute on function public.claim_notification_jobs(integer)
to service_role;
