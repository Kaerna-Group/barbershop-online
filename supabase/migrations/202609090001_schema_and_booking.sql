-- Core schema and client booking operations for one independent hairdresser.
-- All appointment mutations go through narrow RPC functions below.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table public.master_profile (
  singleton boolean primary key default true check (singleton),
  name text not null,
  short_intro text not null default '',
  phone_display text not null default '',
  phone_href text,
  email text,
  address_line text not null default '',
  venue_label text,
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  singleton boolean primary key default true check (singleton),
  master_user_id uuid unique references auth.users(id) on delete restrict,
  timezone text not null default 'Europe/Bucharest' check (timezone = 'Europe/Bucharest'),
  currency text not null default 'RON' check (currency ~ '^[A-Z]{3}$'),
  slot_step_minutes integer not null default 30 check (slot_step_minutes between 5 and 120),
  min_lead_hours integer not null default 2 check (min_lead_hours between 0 and 168),
  booking_horizon_days integer not null default 30 check (booking_horizon_days between 1 and 365),
  change_cutoff_hours integer not null default 12 check (change_cutoff_hours between 0 and 168),
  max_future_bookings integer not null default 3 check (max_future_bookings between 1 and 20),
  reminder_hours integer check (reminder_hours between 1 and 168),
  booking_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text,
  price_minor integer not null check (price_minor >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index services_name_active_unique
  on public.services (lower(name))
  where active;

create table public.weekly_schedule (
  id uuid primary key default extensions.gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at),
  unique (weekday, starts_at, ends_at)
);

create or replace function public.valid_schedule_windows(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  current_item jsonb;
  other_item jsonb;
  current_start time;
  current_end time;
  other_start time;
  other_end time;
begin
  if jsonb_typeof(value) <> 'array' then
    return false;
  end if;

  for current_item in select * from jsonb_array_elements(value)
  loop
    begin
      current_start := (current_item ->> 'start')::time;
      current_end := (current_item ->> 'end')::time;
    exception when others then
      return false;
    end;
    if current_start >= current_end then
      return false;
    end if;

    for other_item in select * from jsonb_array_elements(value)
    loop
      if current_item = other_item then
        continue;
      end if;
      begin
        other_start := (other_item ->> 'start')::time;
        other_end := (other_item ->> 'end')::time;
      exception when others then
        return false;
      end;
      if current_start < other_end and current_end > other_start then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create table public.schedule_overrides (
  id uuid primary key default extensions.gen_random_uuid(),
  day date not null unique,
  windows jsonb not null default '[]'::jsonb check (public.valid_schedule_windows(windows)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  kind text not null check (kind in ('booking', 'block')),
  service_id uuid references public.services(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  busy_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  active boolean not null default true,
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),
  client_name text,
  client_phone text,
  service_name text,
  price_minor integer,
  currency text,
  duration_minutes integer,
  note text,
  created_by_master boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (
    (kind = 'booking'
      and service_id is not null
      and client_name is not null
      and char_length(btrim(client_name)) between 2 and 100
      and client_phone is not null
      and service_name is not null
      and price_minor is not null
      and currency is not null
      and duration_minutes is not null)
    or
    (kind = 'block'
      and service_id is null
      and user_id is null
      and client_name is null
      and client_phone is null
      and service_name is null
      and price_minor is null
      and currency is null
      and duration_minutes is null)
  ),
  constraint calendar_entries_no_overlap
    exclude using gist (busy_range with &&)
    where (active)
);

create index calendar_entries_user_starts_idx
  on public.calendar_entries (user_id, starts_at desc)
  where kind = 'booking';

create index calendar_entries_active_starts_idx
  on public.calendar_entries (starts_at)
  where active;

create table public.booking_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  action text not null check (action in ('create', 'cancel', 'reschedule', 'admin_create', 'admin_block')),
  request_fingerprint text not null,
  calendar_entry_id uuid references public.calendar_entries(id) on delete set null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_id, request_id)
);

create table public.notification_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  calendar_entry_id uuid not null references public.calendar_entries(id) on delete cascade,
  event_type text not null check (event_type in ('confirmation', 'reschedule', 'cancellation', 'reminder')),
  booking_version integer not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_entry_id, event_type, booking_version)
);

create index notification_jobs_due_idx
  on public.notification_jobs (scheduled_for)
  where status in ('pending', 'failed');

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger master_profile_touch_updated_at before update on public.master_profile
for each row execute function public.touch_updated_at();
create trigger app_settings_touch_updated_at before update on public.app_settings
for each row execute function public.touch_updated_at();
create trigger services_touch_updated_at before update on public.services
for each row execute function public.touch_updated_at();
create trigger schedule_overrides_touch_updated_at before update on public.schedule_overrides
for each row execute function public.touch_updated_at();
create trigger calendar_entries_touch_updated_at before update on public.calendar_entries
for each row execute function public.touch_updated_at();
create trigger notification_jobs_touch_updated_at before update on public.notification_jobs
for each row execute function public.touch_updated_at();

alter table public.master_profile enable row level security;
alter table public.app_settings enable row level security;
alter table public.services enable row level security;
alter table public.weekly_schedule enable row level security;
alter table public.schedule_overrides enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.booking_actions enable row level security;
alter table public.notification_jobs enable row level security;

revoke all on table public.master_profile from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.services from anon, authenticated;
revoke all on table public.weekly_schedule from anon, authenticated;
revoke all on table public.schedule_overrides from anon, authenticated;
revoke all on table public.calendar_entries from anon, authenticated;
revoke all on table public.booking_actions from anon, authenticated;
revoke all on table public.notification_jobs from anon, authenticated;

grant select (
  id, kind, service_id, starts_at, ends_at, status, client_name, client_phone,
  service_name, price_minor, currency, duration_minutes, version, created_by_master
) on public.calendar_entries to authenticated;

create policy "clients_read_only_their_bookings"
on public.calendar_entries
for select
to authenticated
using (kind = 'booking' and user_id = (select auth.uid()));

create or replace function public.is_current_user_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_settings settings
    where settings.singleton and settings.master_user_id = auth.uid()
  );
$$;

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
    'client_phone', entry.client_phone,
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

create or replace function public.is_valid_slot(
  service_id_input uuid,
  start_at_input timestamptz,
  ignore_entry_id uuid default null,
  enforce_public_rules boolean default true,
  duration_minutes_override integer default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  service_row public.services%rowtype;
  local_start timestamp;
  local_day date;
  end_at_value timestamptz;
  fits_window boolean;
begin
  select * into settings_row from public.app_settings where singleton;
  select * into service_row from public.services where id = service_id_input;

  if settings_row is null
     or service_row is null
     or (duration_minutes_override is null and not service_row.active) then
    return false;
  end if;

  local_start := start_at_input at time zone settings_row.timezone;
  local_day := local_start::date;
  end_at_value := start_at_input + make_interval(
    mins => coalesce(duration_minutes_override, service_row.duration_minutes)
  );

  if enforce_public_rules then
    if not settings_row.booking_enabled
       or start_at_input < now() + make_interval(hours => settings_row.min_lead_hours)
       or local_day < (now() at time zone settings_row.timezone)::date
       or local_day > (now() at time zone settings_row.timezone)::date + settings_row.booking_horizon_days then
      return false;
    end if;
  end if;

  if exists (select 1 from public.schedule_overrides where day = local_day) then
    select exists (
      select 1
      from public.schedule_overrides override_row,
           lateral jsonb_array_elements(override_row.windows) item
      where override_row.day = local_day
        and start_at_input >= ((local_day + (item ->> 'start')::time) at time zone settings_row.timezone)
        and end_at_value <= ((local_day + (item ->> 'end')::time) at time zone settings_row.timezone)
        and mod(
          extract(epoch from (local_start - (local_day + (item ->> 'start')::time)))::integer / 60,
          settings_row.slot_step_minutes
        ) = 0
    ) into fits_window;
  else
    select exists (
      select 1
      from public.weekly_schedule weekly
      where weekly.weekday = extract(dow from local_day)::integer
        and start_at_input >= ((local_day + weekly.starts_at) at time zone settings_row.timezone)
        and end_at_value <= ((local_day + weekly.ends_at) at time zone settings_row.timezone)
        and mod(
          extract(epoch from (local_start - (local_day + weekly.starts_at)))::integer / 60,
          settings_row.slot_step_minutes
        ) = 0
    ) into fits_window;
  end if;

  if not fits_window then
    return false;
  end if;

  return not exists (
    select 1
    from public.calendar_entries entry
    where entry.active
      and (ignore_entry_id is null or entry.id <> ignore_entry_id)
      and entry.starts_at < end_at_value
      and entry.ends_at > start_at_input
  );
end;
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
      'phone_display', profile.phone_display,
      'phone_href', profile.phone_href,
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

create or replace function public.get_available_slots(p_day date, p_service_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select * from public.app_settings where singleton
  ),
  selected_service as (
    select * from public.services where id = p_service_id and active
  ),
  day_windows as (
    select
      (p_day + (item ->> 'start')::time) at time zone settings.timezone as window_start,
      (p_day + (item ->> 'end')::time) at time zone settings.timezone as window_end
    from settings
    join public.schedule_overrides override_row on override_row.day = p_day
    cross join lateral jsonb_array_elements(override_row.windows) item
    union all
    select
      (p_day + weekly.starts_at) at time zone settings.timezone,
      (p_day + weekly.ends_at) at time zone settings.timezone
    from settings
    join public.weekly_schedule weekly on weekly.weekday = extract(dow from p_day)::integer
    where not exists (select 1 from public.schedule_overrides where day = p_day)
  ),
  candidates as (
    select
      candidate as starts_at,
      candidate + make_interval(mins => selected_service.duration_minutes) as ends_at
    from settings
    cross join selected_service
    cross join day_windows
    cross join lateral generate_series(
      day_windows.window_start,
      day_windows.window_end - make_interval(mins => selected_service.duration_minutes),
      make_interval(mins => settings.slot_step_minutes)
    ) candidate
  )
  select candidates.starts_at, candidates.ends_at
  from candidates
  where public.is_valid_slot(p_service_id, candidates.starts_at, null, true)
  order by candidates.starts_at;
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
  user_phone text;
  fingerprint text;
  result_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'APP_PHONE_REQUIRED';
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

  select phone into user_phone from auth.users where id = auth.uid();
  if user_phone is null or btrim(user_phone) = '' then
    raise exception 'APP_PHONE_REQUIRED';
  end if;
  if char_length(btrim(p_client_name)) not between 2 and 100 then
    raise exception 'APP_INVALID_NAME';
  end if;

  select * into service_row from public.services where id = p_service_id and active;
  if not found then
    raise exception 'APP_SERVICE_UNAVAILABLE';
  end if;

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
    client_name, client_phone, service_name, price_minor, currency,
    duration_minutes, created_by_master
  ) values (
    'booking', service_row.id, auth.uid(), p_start_at,
    p_start_at + make_interval(mins => service_row.duration_minutes),
    'confirmed', true, btrim(p_client_name), user_phone, service_row.name,
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
  when exclusion_violation then
    raise exception 'APP_SLOT_TAKEN';
end;
$$;

create or replace function public.get_reschedule_slots(p_day date, p_booking_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  booking_row public.calendar_entries%rowtype;
  settings_row public.app_settings%rowtype;
  is_master boolean;
begin
  if auth.uid() is null then raise exception 'APP_PHONE_REQUIRED'; end if;
  select * into settings_row from public.app_settings where singleton;
  is_master := public.is_current_user_master();
  select * into booking_row
  from public.calendar_entries
  where id = p_booking_id
    and kind = 'booking'
    and (user_id = auth.uid() or is_master);
  if not found then raise exception 'APP_BOOKING_NOT_FOUND'; end if;

  return query
  with day_windows as (
    select
      (p_day + (item ->> 'start')::time) at time zone settings_row.timezone as window_start,
      (p_day + (item ->> 'end')::time) at time zone settings_row.timezone as window_end
    from public.schedule_overrides override_row
    cross join lateral jsonb_array_elements(override_row.windows) item
    where override_row.day = p_day
    union all
    select
      (p_day + weekly.starts_at) at time zone settings_row.timezone,
      (p_day + weekly.ends_at) at time zone settings_row.timezone
    from public.weekly_schedule weekly
    where weekly.weekday = extract(dow from p_day)::integer
      and not exists (select 1 from public.schedule_overrides where day = p_day)
  ), candidates as (
    select
      candidate as starts_at,
      candidate + make_interval(mins => booking_row.duration_minutes) as ends_at
    from day_windows
    cross join lateral generate_series(
      day_windows.window_start,
      day_windows.window_end - make_interval(mins => booking_row.duration_minutes),
      make_interval(mins => settings_row.slot_step_minutes)
    ) candidate
  )
  select candidates.starts_at, candidates.ends_at
  from candidates
  where public.is_valid_slot(
    booking_row.service_id,
    candidates.starts_at,
    booking_row.id,
    not is_master,
    booking_row.duration_minutes
  )
  order by candidates.starts_at;
end;
$$;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  booking_row public.calendar_entries%rowtype;
  existing_action public.booking_actions%rowtype;
  fingerprint text;
  result_value jsonb;
begin
  if auth.uid() is null then raise exception 'APP_PHONE_REQUIRED'; end if;
  select * into settings_row from public.app_settings where singleton for update;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'cancel', p_booking_id::text, p_expected_version::text), 'sha256'
  ), 'hex');

  select * into existing_action from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then raise exception 'APP_IDEMPOTENCY_MISMATCH'; end if;
    return existing_action.result;
  end if;

  select * into booking_row from public.calendar_entries
  where id = p_booking_id and kind = 'booking' and user_id = auth.uid()
  for update;
  if not found then raise exception 'APP_BOOKING_NOT_FOUND'; end if;
  if booking_row.version <> p_expected_version then raise exception 'APP_STALE_VERSION'; end if;
  if booking_row.status <> 'confirmed' then raise exception 'APP_BOOKING_NOT_ACTIVE'; end if;
  if now() > booking_row.starts_at - make_interval(hours => settings_row.change_cutoff_hours) then
    raise exception 'APP_CHANGE_CUTOFF';
  end if;

  update public.calendar_entries
  set status = 'cancelled', active = false, version = version + 1
  where id = booking_row.id;

  update public.notification_jobs
  set status = 'cancelled'
  where calendar_entry_id = booking_row.id and status in ('pending', 'failed');

  insert into public.notification_jobs (calendar_entry_id, event_type, booking_version, scheduled_for)
  values (booking_row.id, 'cancellation', booking_row.version + 1, now());

  result_value := public.calendar_entry_json(booking_row.id);
  insert into public.booking_actions (actor_id, request_id, action, request_fingerprint, calendar_entry_id, result)
  values (auth.uid(), p_request_id, 'cancel', fingerprint, booking_row.id, result_value);
  return result_value;
end;
$$;

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_new_start_at timestamptz,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.app_settings%rowtype;
  booking_row public.calendar_entries%rowtype;
  existing_action public.booking_actions%rowtype;
  fingerprint text;
  result_value jsonb;
begin
  if auth.uid() is null then raise exception 'APP_PHONE_REQUIRED'; end if;
  select * into settings_row from public.app_settings where singleton for update;
  fingerprint := encode(extensions.digest(
    concat_ws('|', 'reschedule', p_booking_id::text, p_new_start_at::text, p_expected_version::text),
    'sha256'
  ), 'hex');

  select * into existing_action from public.booking_actions
  where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing_action.request_fingerprint <> fingerprint then raise exception 'APP_IDEMPOTENCY_MISMATCH'; end if;
    return existing_action.result;
  end if;

  select * into booking_row from public.calendar_entries
  where id = p_booking_id and kind = 'booking' and user_id = auth.uid()
  for update;
  if not found then raise exception 'APP_BOOKING_NOT_FOUND'; end if;
  if booking_row.version <> p_expected_version then raise exception 'APP_STALE_VERSION'; end if;
  if booking_row.status <> 'confirmed' then raise exception 'APP_BOOKING_NOT_ACTIVE'; end if;
  if now() > booking_row.starts_at - make_interval(hours => settings_row.change_cutoff_hours) then
    raise exception 'APP_CHANGE_CUTOFF';
  end if;
  if not public.is_valid_slot(
    booking_row.service_id,
    p_new_start_at,
    booking_row.id,
    true,
    booking_row.duration_minutes
  ) then
    raise exception 'APP_SLOT_TAKEN';
  end if;

  update public.calendar_entries
  set starts_at = p_new_start_at,
      ends_at = p_new_start_at + make_interval(mins => booking_row.duration_minutes),
      version = version + 1
  where id = booking_row.id;

  update public.notification_jobs
  set status = 'cancelled'
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
  insert into public.booking_actions (actor_id, request_id, action, request_fingerprint, calendar_entry_id, result)
  values (auth.uid(), p_request_id, 'reschedule', fingerprint, booking_row.id, result_value);
  return result_value;
exception
  when exclusion_violation then raise exception 'APP_SLOT_TAKEN';
end;
$$;

revoke all on function public.valid_schedule_windows(jsonb) from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.calendar_entry_json(uuid) from public, anon, authenticated;
revoke all on function public.is_valid_slot(uuid, timestamptz, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.is_current_user_master() from public, anon, authenticated;
revoke all on function public.get_public_config() from public, anon, authenticated;
revoke all on function public.get_available_slots(date, uuid) from public, anon, authenticated;
revoke all on function public.create_booking(uuid, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.get_reschedule_slots(date, uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.reschedule_booking(uuid, timestamptz, integer, uuid) from public, anon, authenticated;

grant execute on function public.is_current_user_master() to authenticated;
grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.get_public_config() to service_role;
grant execute on function public.get_available_slots(date, uuid) to anon, authenticated;
grant execute on function public.create_booking(uuid, timestamptz, text, uuid) to authenticated;
grant execute on function public.get_reschedule_slots(date, uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, integer, uuid) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz, integer, uuid) to authenticated;
