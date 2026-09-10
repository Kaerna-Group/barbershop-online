-- Replace customer phone identity with passwordless email OTP.
-- Applied migrations remain immutable; legacy phone values are removed here.

alter table public.calendar_entries add column client_email text;

update public.calendar_entries entry
set client_email = coalesce(
  (
    select lower(nullif(btrim(auth_user.email), ''))
    from auth.users auth_user
    where auth_user.id = entry.user_id
  ),
  'legacy+' || replace(entry.id::text, '-', '') || '@invalid'
)
where entry.kind = 'booking';

update public.notification_jobs job
set status = 'cancelled',
    locked_at = null,
    last_error = 'recipient_email_unavailable_after_migration'
from public.calendar_entries entry
where entry.id = job.calendar_entry_id
  and entry.client_email like 'legacy+%@invalid'
  and job.status in ('pending', 'processing', 'failed');

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_item.conname
    from pg_constraint constraint_item
    where constraint_item.conrelid = 'public.calendar_entries'::regclass
      and constraint_item.contype = 'c'
      and pg_get_constraintdef(constraint_item.oid) ilike '%client_phone%'
  loop
    execute format(
      'alter table public.calendar_entries drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.calendar_entries
  add constraint calendar_entries_booking_shape_email_check check (
    (
      kind = 'booking'
      and service_id is not null
      and client_name is not null
      and char_length(btrim(client_name)) between 2 and 100
      and client_email is not null
      and char_length(btrim(client_email)) between 3 and 320
      and client_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      and service_name is not null
      and price_minor is not null
      and currency is not null
      and duration_minutes is not null
    )
    or
    (
      kind = 'block'
      and service_id is null
      and user_id is null
      and client_name is null
      and client_email is null
      and service_name is null
      and price_minor is null
      and currency is null
      and duration_minutes is null
    )
  );

create or replace function public.calendar_entry_json(entry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', entry.id,
    'service_id', entry.service_id,
    'starts_at', entry.starts_at,
    'ends_at', entry.ends_at,
    'status', entry.status,
    'client_name', entry.client_name,
    'client_email', entry.client_email,
    'service_name', entry.service_name,
    'price_minor', entry.price_minor,
    'currency', entry.currency,
    'duration_minutes', entry.duration_minutes,
    'version', entry.version,
    'created_by_master', entry.created_by_master
  )
  from public.calendar_entries entry
  where entry.id = entry_id;
$$;

create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'name', profile.name,
      'short_intro', profile.short_intro,
      'email', profile.email,
      'address_line', profile.address_line,
      'venue_label', profile.venue_label
    ),
    'settings', jsonb_build_object(
      'timezone', settings.timezone,
      'currency', settings.currency,
      'slot_step_minutes', settings.slot_step_minutes,
      'min_lead_hours', settings.min_lead_hours,
      'booking_horizon_days', settings.booking_horizon_days,
      'change_cutoff_hours', settings.change_cutoff_hours,
      'max_future_bookings', settings.max_future_bookings,
      'reminder_hours', settings.reminder_hours,
      'booking_enabled', settings.booking_enabled
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', service.id,
          'name', service.name,
          'description', service.description,
          'price_minor', service.price_minor,
          'currency', settings.currency,
          'duration_minutes', service.duration_minutes,
          'active', service.active,
          'sort_order', service.sort_order
        ) order by service.sort_order, service.name
      )
      from public.services service
      where service.active
    ), '[]'::jsonb)
  )
  from public.master_profile profile
  cross join public.app_settings settings
  where profile.singleton and settings.singleton;
$$;

create or replace function public.create_booking(
  p_service_id uuid,
  p_start_at timestamptz,
  p_client_name text,
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
  user_email text;
  fingerprint text;
  result_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'APP_EMAIL_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception 'APP_REQUEST_ID_REQUIRED';
  end if;

  select * into settings_row from public.app_settings where singleton for update;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'create', p_service_id::text, p_start_at::text, btrim(p_client_name)),
    'sha256'
  ), 'hex');

  select * into existing_action
  from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then
      raise exception 'APP_IDEMPOTENCY_MISMATCH';
    end if;
    return existing_action.result;
  end if;

  select lower(nullif(btrim(email), '')) into user_email
  from auth.users
  where id = auth.uid();
  if user_email is null
     or char_length(user_email) > 320
     or user_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'APP_EMAIL_REQUIRED';
  end if;
  if char_length(btrim(p_client_name)) not between 2 and 100 then
    raise exception 'APP_INVALID_NAME';
  end if;

  select * into service_row from public.services where id = p_service_id and active;
  if not found then raise exception 'APP_SERVICE_UNAVAILABLE'; end if;

  if (
    select count(*)
    from public.calendar_entries entry
    where entry.kind = 'booking'
      and entry.user_id = auth.uid()
      and entry.status = 'confirmed'
      and entry.starts_at >= now()
  ) >= settings_row.max_future_bookings then
    raise exception 'APP_BOOKING_LIMIT';
  end if;

  if not public.is_valid_slot(p_service_id, p_start_at, null, true) then
    raise exception 'APP_SLOT_TAKEN';
  end if;

  insert into public.calendar_entries (
    kind, service_id, user_id, starts_at, ends_at, status, active,
    client_name, client_email, service_name, price_minor, currency,
    duration_minutes, created_by_master
  ) values (
    'booking', service_row.id, auth.uid(), p_start_at,
    p_start_at + make_interval(mins => service_row.duration_minutes),
    'confirmed', true, btrim(p_client_name), user_email, service_row.name,
    service_row.price_minor, settings_row.currency, service_row.duration_minutes, false
  ) returning id into new_entry_id;

  result_value := public.calendar_entry_json(new_entry_id);
  insert into public.booking_actions (
    actor_id, request_id, action, request_fingerprint, calendar_entry_id, result
  ) values (
    auth.uid(), p_request_id, 'create', fingerprint, new_entry_id, result_value
  );

  insert into public.notification_jobs (
    calendar_entry_id, event_type, booking_version, scheduled_for
  ) values (new_entry_id, 'confirmation', 1, now());

  if settings_row.reminder_hours is not null
     and p_start_at - make_interval(hours => settings_row.reminder_hours) > now() then
    insert into public.notification_jobs (
      calendar_entry_id, event_type, booking_version, scheduled_for
    ) values (
      new_entry_id,
      'reminder',
      1,
      p_start_at - make_interval(hours => settings_row.reminder_hours)
    );
  end if;

  return result_value;
exception
  when exclusion_violation then raise exception 'APP_SLOT_TAKEN';
end;
$$;

do $$
declare
  function_oid oid;
begin
  foreach function_oid in array array[
    'public.get_reschedule_slots(date,uuid)'::regprocedure::oid,
    'public.cancel_booking(uuid,integer,uuid)'::regprocedure::oid,
    'public.reschedule_booking(uuid,timestamp with time zone,integer,uuid)'::regprocedure::oid
  ]
  loop
    execute replace(
      pg_get_functiondef(function_oid),
      'APP_PHONE_REQUIRED',
      'APP_EMAIL_REQUIRED'
    );
  end loop;
end;
$$;

revoke all on function public.admin_list_calendar(date, date) from public, anon, authenticated;
drop function public.admin_list_calendar(date, date);

create function public.admin_list_calendar(p_from date, p_to date)
returns table (
  id uuid,
  kind text,
  service_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  client_name text,
  client_email text,
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
    entry.client_email,
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

revoke all on function public.admin_update_public_profile(text, text, text, text, text, text, text)
from public, anon, authenticated;
drop function public.admin_update_public_profile(text, text, text, text, text, text, text);

create function public.admin_update_public_profile(
  p_name text,
  p_short_intro text,
  p_email text,
  p_address_line text,
  p_venue_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  perform public.assert_current_user_is_master();
  if char_length(btrim(p_name)) not between 1 and 100
     or char_length(btrim(p_address_line)) not between 3 and 300
     or (
       normalized_email is not null
       and (
         char_length(normalized_email) > 320
         or normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       )
     ) then
    raise exception 'APP_INVALID_PROFILE';
  end if;
  update public.master_profile
  set name = btrim(p_name),
      short_intro = left(btrim(coalesce(p_short_intro, '')), 300),
      email = normalized_email,
      address_line = btrim(p_address_line),
      venue_label = nullif(left(btrim(coalesce(p_venue_label, '')), 160), '')
  where singleton;
end;
$$;

revoke all on function public.admin_create_booking(uuid, timestamptz, text, text, uuid)
from public, anon, authenticated;
drop function public.admin_create_booking(uuid, timestamptz, text, text, uuid);

create function public.admin_create_booking(
  p_service_id uuid,
  p_start_at timestamptz,
  p_client_name text,
  p_client_email text,
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
  normalized_email text := lower(btrim(coalesce(p_client_email, '')));
  fingerprint text;
  result_value jsonb;
begin
  perform public.assert_current_user_is_master();
  select * into settings_row from public.app_settings where singleton for update;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'admin_create', p_service_id::text, p_start_at::text, btrim(p_client_name), normalized_email),
    'sha256'
  ), 'hex');

  select * into existing_action from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then
      raise exception 'APP_IDEMPOTENCY_MISMATCH';
    end if;
    return existing_action.result;
  end if;

  if char_length(btrim(p_client_name)) not between 2 and 100
     or char_length(normalized_email) not between 3 and 320
     or normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'APP_INVALID_CLIENT';
  end if;
  select * into service_row from public.services where id = p_service_id and active;
  if not found then raise exception 'APP_SERVICE_UNAVAILABLE'; end if;
  if not public.is_valid_slot(p_service_id, p_start_at, null, false) then
    raise exception 'APP_SLOT_TAKEN';
  end if;

  insert into public.calendar_entries (
    kind, service_id, user_id, starts_at, ends_at, status, active,
    client_name, client_email, service_name, price_minor, currency,
    duration_minutes, created_by_master
  ) values (
    'booking', service_row.id, null, p_start_at,
    p_start_at + make_interval(mins => service_row.duration_minutes),
    'confirmed', true, btrim(p_client_name), normalized_email, service_row.name,
    service_row.price_minor, settings_row.currency, service_row.duration_minutes, true
  ) returning id into new_entry_id;

  result_value := public.calendar_entry_json(new_entry_id);
  insert into public.booking_actions (
    actor_id, request_id, action, request_fingerprint, calendar_entry_id, result
  ) values (
    auth.uid(), p_request_id, 'admin_create', fingerprint, new_entry_id, result_value
  );
  insert into public.notification_jobs (
    calendar_entry_id, event_type, booking_version, scheduled_for
  ) values (new_entry_id, 'confirmation', 1, now());
  if settings_row.reminder_hours is not null
     and p_start_at - make_interval(hours => settings_row.reminder_hours) > now() then
    insert into public.notification_jobs (
      calendar_entry_id, event_type, booking_version, scheduled_for
    ) values (
      new_entry_id,
      'reminder',
      1,
      p_start_at - make_interval(hours => settings_row.reminder_hours)
    );
  end if;
  return result_value;
exception
  when exclusion_violation then raise exception 'APP_SLOT_TAKEN';
end;
$$;

alter table public.master_profile
  drop column phone_display,
  drop column phone_href;

alter table public.calendar_entries drop column client_phone;

grant select (client_email) on public.calendar_entries to authenticated;

revoke all on function public.calendar_entry_json(uuid) from public, anon, authenticated;
revoke all on function public.get_public_config() from public, anon, authenticated;
revoke all on function public.create_booking(uuid, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_calendar(date, date) from public, anon, authenticated;
revoke all on function public.admin_update_public_profile(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_create_booking(uuid, timestamptz, text, text, uuid) from public, anon, authenticated;

grant execute on function public.get_public_config() to anon, authenticated, service_role;
grant execute on function public.create_booking(uuid, timestamptz, text, uuid) to authenticated;
grant execute on function public.admin_list_calendar(date, date) to authenticated;
grant execute on function public.admin_update_public_profile(text, text, text, text, text) to authenticated;
grant execute on function public.admin_create_booking(uuid, timestamptz, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
