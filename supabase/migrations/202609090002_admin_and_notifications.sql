-- Master-only operations and the notification worker queue.

create or replace function public.assert_current_user_is_master()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_settings
    where singleton and master_user_id = auth.uid()
  ) then
    raise exception 'APP_FORBIDDEN';
  end if;
end;
$$;

create or replace function public.admin_list_calendar(p_from date, p_to date)
returns table (
  id uuid,
  kind text,
  service_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  client_name text,
  client_phone text,
  service_name text,
  price_minor integer,
  currency text,
  duration_minutes integer,
  version integer,
  created_by_master boolean,
  note text,
  notification_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  zone text;
begin
  perform public.assert_current_user_is_master();
  if p_to < p_from or p_to > p_from + 93 then
    raise exception 'APP_INVALID_DATE_RANGE';
  end if;
  select timezone into zone from public.app_settings where singleton;

  return query
  select
    entry.id,
    entry.kind,
    entry.service_id,
    entry.starts_at,
    entry.ends_at,
    entry.status,
    entry.client_name,
    entry.client_phone,
    entry.service_name,
    entry.price_minor,
    entry.currency,
    case
      when entry.kind = 'booking' then entry.duration_minutes
      else (extract(epoch from entry.ends_at - entry.starts_at) / 60)::integer
    end,
    entry.version,
    entry.created_by_master,
    entry.note,
    latest_job.status
  from public.calendar_entries entry
  left join lateral (
    select job.status
    from public.notification_jobs job
    where job.calendar_entry_id = entry.id
    order by job.created_at desc
    limit 1
  ) latest_job on true
  where entry.starts_at >= ((p_from::timestamp) at time zone zone)
    and entry.starts_at < (((p_to + 1)::timestamp) at time zone zone)
  order by entry.starts_at;
end;
$$;

create or replace function public.admin_get_weekly_schedule()
returns table (id uuid, weekday smallint, starts_at time, ends_at time)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_current_user_is_master();
  return query
  select weekly.id, weekly.weekday, weekly.starts_at, weekly.ends_at
  from public.weekly_schedule weekly
  order by weekly.weekday, weekly.starts_at;
end;
$$;

create or replace function public.admin_replace_weekly_schedule(p_windows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  booking_row public.calendar_entries%rowtype;
begin
  perform public.assert_current_user_is_master();
  perform 1 from public.app_settings where singleton for update;
  if jsonb_typeof(p_windows) <> 'array' then raise exception 'APP_INVALID_SCHEDULE'; end if;

  delete from public.weekly_schedule;
  for item in select * from jsonb_array_elements(p_windows)
  loop
    begin
      insert into public.weekly_schedule (weekday, starts_at, ends_at)
      values (
        (item ->> 'weekday')::smallint,
        (item ->> 'start')::time,
        (item ->> 'end')::time
      );
    exception when others then
      raise exception 'APP_INVALID_SCHEDULE';
    end;
  end loop;

  if exists (
    select 1
    from public.weekly_schedule first_window
    join public.weekly_schedule second_window
      on first_window.weekday = second_window.weekday
     and first_window.id < second_window.id
     and first_window.starts_at < second_window.ends_at
     and first_window.ends_at > second_window.starts_at
  ) then
    raise exception 'APP_SCHEDULE_OVERLAP';
  end if;

  for booking_row in
    select * from public.calendar_entries
    where active and kind = 'booking' and starts_at >= now()
  loop
    if not public.is_valid_slot(
      booking_row.service_id,
      booking_row.starts_at,
      booking_row.id,
      false,
      booking_row.duration_minutes
    ) then
      raise exception 'APP_SCHEDULE_CONFLICT';
    end if;
  end loop;
end;
$$;

create or replace function public.admin_set_schedule_override(p_day date, p_windows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.calendar_entries%rowtype;
  zone text;
begin
  perform public.assert_current_user_is_master();
  perform 1 from public.app_settings where singleton for update;
  if not public.valid_schedule_windows(p_windows) then raise exception 'APP_INVALID_SCHEDULE'; end if;

  insert into public.schedule_overrides (day, windows)
  values (p_day, p_windows)
  on conflict (day) do update set windows = excluded.windows;

  select timezone into zone from public.app_settings where singleton;
  for booking_row in
    select * from public.calendar_entries
    where active
      and kind = 'booking'
      and (starts_at at time zone zone)::date = p_day
  loop
    if not public.is_valid_slot(
      booking_row.service_id,
      booking_row.starts_at,
      booking_row.id,
      false,
      booking_row.duration_minutes
    ) then
      raise exception 'APP_SCHEDULE_CONFLICT';
    end if;
  end loop;
end;
$$;

create or replace function public.admin_update_public_profile(
  p_name text,
  p_short_intro text,
  p_phone_display text,
  p_phone_href text,
  p_email text,
  p_address_line text,
  p_venue_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_current_user_is_master();
  if char_length(btrim(p_name)) not between 1 and 100
     or char_length(btrim(p_address_line)) not between 3 and 300 then
    raise exception 'APP_INVALID_PROFILE';
  end if;
  update public.master_profile
  set name = btrim(p_name),
      short_intro = left(btrim(coalesce(p_short_intro, '')), 300),
      phone_display = left(btrim(coalesce(p_phone_display, '')), 40),
      phone_href = nullif(left(btrim(coalesce(p_phone_href, '')), 40), ''),
      email = nullif(left(btrim(coalesce(p_email, '')), 200), ''),
      address_line = btrim(p_address_line),
      venue_label = nullif(left(btrim(coalesce(p_venue_label, '')), 160), '')
  where singleton;
end;
$$;

create or replace function public.admin_update_booking_settings(
  p_slot_step_minutes integer,
  p_min_lead_hours integer,
  p_booking_horizon_days integer,
  p_change_cutoff_hours integer,
  p_max_future_bookings integer,
  p_reminder_hours integer,
  p_booking_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_current_user_is_master();
  perform 1 from public.app_settings where singleton for update;
  update public.app_settings
  set slot_step_minutes = p_slot_step_minutes,
      min_lead_hours = p_min_lead_hours,
      booking_horizon_days = p_booking_horizon_days,
      change_cutoff_hours = p_change_cutoff_hours,
      max_future_bookings = p_max_future_bookings,
      reminder_hours = p_reminder_hours,
      booking_enabled = p_booking_enabled
  where singleton;
exception when check_violation then
  raise exception 'APP_INVALID_SETTINGS';
end;
$$;

create or replace function public.admin_upsert_service(
  p_id uuid,
  p_name text,
  p_description text,
  p_price_minor integer,
  p_duration_minutes integer,
  p_active boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  perform public.assert_current_user_is_master();
  perform 1 from public.app_settings where singleton for update;
  if p_id is null then
    insert into public.services (name, description, price_minor, duration_minutes, active, sort_order)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_price_minor, p_duration_minutes, p_active, p_sort_order)
    returning id into result_id;
  else
    update public.services
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        price_minor = p_price_minor,
        duration_minutes = p_duration_minutes,
        active = p_active,
        sort_order = p_sort_order
    where id = p_id
    returning id into result_id;
    if result_id is null then raise exception 'APP_SERVICE_NOT_FOUND'; end if;
  end if;
  return result_id;
exception when check_violation or unique_violation then
  raise exception 'APP_INVALID_SERVICE';
end;
$$;

create or replace function public.admin_create_booking(
  p_service_id uuid,
  p_start_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  service_row public.services%rowtype;
  existing_action public.booking_actions%rowtype;
  new_entry_id uuid;
  fingerprint text;
  result_value jsonb;
begin
  perform public.assert_current_user_is_master();
  select * into settings_row from public.app_settings where singleton for update;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'admin_create', p_service_id::text, p_start_at::text, btrim(p_client_name), btrim(p_client_phone)),
    'sha256'
  ), 'hex');

  select * into existing_action from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then raise exception 'APP_IDEMPOTENCY_MISMATCH'; end if;
    return existing_action.result;
  end if;

  if char_length(btrim(p_client_name)) not between 2 and 100
     or char_length(btrim(p_client_phone)) not between 7 and 40 then
    raise exception 'APP_INVALID_CLIENT';
  end if;
  select * into service_row from public.services where id = p_service_id and active;
  if not found then raise exception 'APP_SERVICE_UNAVAILABLE'; end if;
  if not public.is_valid_slot(p_service_id, p_start_at, null, false) then
    raise exception 'APP_SLOT_TAKEN';
  end if;

  insert into public.calendar_entries (
    kind, service_id, user_id, starts_at, ends_at, status, active,
    client_name, client_phone, service_name, price_minor, currency,
    duration_minutes, created_by_master
  ) values (
    'booking', service_row.id, null, p_start_at,
    p_start_at + make_interval(mins => service_row.duration_minutes),
    'confirmed', true, btrim(p_client_name), btrim(p_client_phone), service_row.name,
    service_row.price_minor, settings_row.currency, service_row.duration_minutes, true
  ) returning id into new_entry_id;

  result_value := public.calendar_entry_json(new_entry_id);
  insert into public.booking_actions (actor_id, request_id, action, request_fingerprint, calendar_entry_id, result)
  values (auth.uid(), p_request_id, 'admin_create', fingerprint, new_entry_id, result_value);
  insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
  values (new_entry_id, 'confirmation', 1, now());
  if settings_row.reminder_hours is not null
     and p_start_at - make_interval(hours => settings_row.reminder_hours) > now() then
    insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
    values (new_entry_id, 'reminder', 1, p_start_at - make_interval(hours => settings_row.reminder_hours));
  end if;
  return result_value;
exception when exclusion_violation then
  raise exception 'APP_SLOT_TAKEN';
end;
$$;

create or replace function public.admin_create_block(
  p_day date,
  p_start time,
  p_end time,
  p_note text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  existing_action public.booking_actions%rowtype;
  start_value timestamptz;
  end_value timestamptz;
  new_entry_id uuid;
  fingerprint text;
  result_value jsonb;
  fits_window boolean;
begin
  perform public.assert_current_user_is_master();
  select * into settings_row from public.app_settings where singleton for update;
  if p_start >= p_end then raise exception 'APP_INVALID_BLOCK'; end if;
  start_value := (p_day + p_start) at time zone settings_row.timezone;
  end_value := (p_day + p_end) at time zone settings_row.timezone;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'admin_block', p_day::text, p_start::text, p_end::text, coalesce(p_note, '')),
    'sha256'
  ), 'hex');

  select * into existing_action from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then raise exception 'APP_IDEMPOTENCY_MISMATCH'; end if;
    return existing_action.calendar_entry_id;
  end if;

  if exists (select 1 from public.schedule_overrides where day = p_day) then
    select exists (
      select 1 from public.schedule_overrides override_row,
      lateral jsonb_array_elements(override_row.windows) item
      where override_row.day = p_day
        and p_start >= (item ->> 'start')::time
        and p_end <= (item ->> 'end')::time
    ) into fits_window;
  else
    select exists (
      select 1 from public.weekly_schedule weekly
      where weekly.weekday = extract(dow from p_day)::integer
        and p_start >= weekly.starts_at and p_end <= weekly.ends_at
    ) into fits_window;
  end if;
  if not fits_window then raise exception 'APP_OUTSIDE_WORKING_HOURS'; end if;

  insert into public.calendar_entries (
    kind, starts_at, ends_at, status, active, note, created_by_master
  ) values (
    'block', start_value, end_value, 'confirmed', true,
    nullif(left(btrim(coalesce(p_note, '')), 300), ''), true
  ) returning id into new_entry_id;
  result_value := jsonb_build_object('id', new_entry_id);
  insert into public.booking_actions (actor_id, request_id, action, request_fingerprint, calendar_entry_id, result)
  values (auth.uid(), p_request_id, 'admin_block', fingerprint, new_entry_id, result_value);
  return new_entry_id;
exception when exclusion_violation then
  raise exception 'APP_SLOT_TAKEN';
end;
$$;

create or replace function public.admin_set_booking_status(
  p_booking_id uuid,
  p_status text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.calendar_entries%rowtype;
  result_value jsonb;
begin
  perform public.assert_current_user_is_master();
  perform 1 from public.app_settings where singleton for update;
  if p_status not in ('completed', 'cancelled', 'no_show') then raise exception 'APP_INVALID_STATUS'; end if;

  select * into booking_row from public.calendar_entries
  where id = p_booking_id and kind = 'booking' for update;
  if not found then raise exception 'APP_BOOKING_NOT_FOUND'; end if;
  if booking_row.version <> p_expected_version then raise exception 'APP_STALE_VERSION'; end if;
  if booking_row.status <> 'confirmed' then raise exception 'APP_BOOKING_NOT_ACTIVE'; end if;
  if p_status in ('completed', 'no_show') and now() < booking_row.ends_at then
    raise exception 'APP_STATUS_TOO_EARLY';
  end if;

  update public.calendar_entries
  set status = p_status, active = false, version = version + 1
  where id = booking_row.id;
  update public.notification_jobs
  set status = 'cancelled'
  where calendar_entry_id = booking_row.id and status in ('pending', 'failed');
  if p_status = 'cancelled' then
    insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
    values (booking_row.id, 'cancellation', booking_row.version + 1, now());
  end if;
  result_value := public.calendar_entry_json(booking_row.id);
  return result_value;
end;
$$;

create or replace function public.admin_reschedule_booking(
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  booking_row public.calendar_entries%rowtype;
  result_value jsonb;
begin
  perform public.assert_current_user_is_master();
  select * into settings_row from public.app_settings where singleton for update;
  select * into booking_row from public.calendar_entries
  where id = p_booking_id and kind = 'booking' for update;
  if not found then raise exception 'APP_BOOKING_NOT_FOUND'; end if;
  if booking_row.version <> p_expected_version then raise exception 'APP_STALE_VERSION'; end if;
  if booking_row.status <> 'confirmed' then raise exception 'APP_BOOKING_NOT_ACTIVE'; end if;
  if not public.is_valid_slot(
    booking_row.service_id, p_new_start_at, booking_row.id, false, booking_row.duration_minutes
  ) then
    raise exception 'APP_SLOT_TAKEN';
  end if;

  update public.calendar_entries
  set starts_at = p_new_start_at,
      ends_at = p_new_start_at + make_interval(mins => booking_row.duration_minutes),
      version = version + 1
  where id = booking_row.id;
  update public.notification_jobs set status = 'cancelled'
  where calendar_entry_id = booking_row.id and status in ('pending', 'failed');
  insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
  values (booking_row.id, 'reschedule', booking_row.version + 1, now());
  if settings_row.reminder_hours is not null
     and p_new_start_at - make_interval(hours => settings_row.reminder_hours) > now() then
    insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
    values (
      booking_row.id, 'reminder', booking_row.version + 1,
      p_new_start_at - make_interval(hours => settings_row.reminder_hours)
    );
  end if;
  result_value := public.calendar_entry_json(booking_row.id);
  return result_value;
exception when exclusion_violation then
  raise exception 'APP_SLOT_TAKEN';
end;
$$;

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
  if auth.role() <> 'service_role' then raise exception 'APP_FORBIDDEN'; end if;
  return query
  with candidates as (
    select job.id
    from public.notification_jobs job
    where job.scheduled_for <= now()
      and (
        job.status in ('pending', 'failed')
        or (job.status = 'processing' and job.locked_at < now() - interval '10 minutes')
      )
      and job.attempt_count < 5
    order by job.scheduled_for
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.notification_jobs job
  set status = 'processing', locked_at = now(), attempt_count = job.attempt_count + 1
  from candidates
  where job.id = candidates.id
  returning job.id, job.calendar_entry_id, job.event_type, job.booking_version, job.attempt_count;
end;
$$;

revoke all on function public.assert_current_user_is_master() from public, anon, authenticated;
revoke all on function public.admin_list_calendar(date, date) from public, anon, authenticated;
revoke all on function public.admin_get_weekly_schedule() from public, anon, authenticated;
revoke all on function public.admin_replace_weekly_schedule(jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_schedule_override(date, jsonb) from public, anon, authenticated;
revoke all on function public.admin_update_public_profile(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_booking_settings(integer, integer, integer, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_upsert_service(uuid, text, text, integer, integer, boolean, integer) from public, anon, authenticated;
revoke all on function public.admin_create_booking(uuid, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_create_block(date, time, time, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_booking_status(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.admin_reschedule_booking(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_notification_jobs(integer) from public, anon, authenticated;

grant execute on function public.admin_list_calendar(date, date) to authenticated;
grant execute on function public.admin_get_weekly_schedule() to authenticated;
grant execute on function public.admin_replace_weekly_schedule(jsonb) to authenticated;
grant execute on function public.admin_set_schedule_override(date, jsonb) to authenticated;
grant execute on function public.admin_update_public_profile(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_booking_settings(integer, integer, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.admin_upsert_service(uuid, text, text, integer, integer, boolean, integer) to authenticated;
grant execute on function public.admin_create_booking(uuid, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.admin_create_block(date, time, time, text, uuid) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text, integer) to authenticated;
grant execute on function public.admin_reschedule_booking(uuid, timestamptz, integer) to authenticated;
grant execute on function public.claim_notification_jobs(integer) to service_role;
