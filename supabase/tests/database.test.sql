begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_table('public', 'master_profile', 'master profile exists');
select has_table('public', 'app_settings', 'settings exist');
select has_table('public', 'services', 'services exist');
select has_table('public', 'weekly_schedule', 'weekly schedule exists');
select has_table('public', 'schedule_overrides', 'date overrides exist');
select has_table('public', 'calendar_entries', 'shared calendar exists');
select has_table('public', 'booking_actions', 'idempotency log exists');
select has_table('public', 'notification_jobs', 'notification queue exists');

select has_function('public', 'get_public_config', array[]::text[], 'public config RPC exists');
select has_function('public', 'get_available_slots', array['date', 'uuid'], 'availability RPC exists');
select has_function(
  'public',
  'create_booking',
  array['uuid', 'timestamp with time zone', 'text', 'uuid'],
  'atomic create RPC exists'
);
select has_function(
  'public',
  'reschedule_booking',
  array['uuid', 'timestamp with time zone', 'integer', 'uuid'],
  'atomic reschedule RPC exists'
);
select has_function(
  'public',
  'cancel_booking',
  array['uuid', 'integer', 'uuid'],
  'atomic cancellation RPC exists'
);

select col_is_pk('public', 'calendar_entries', 'id', 'calendar ids are primary keys');
select has_column('public', 'calendar_entries', 'busy_range', 'calendar has a generated range');
select col_not_null('public', 'calendar_entries', 'starts_at', 'start is required');
select col_not_null('public', 'calendar_entries', 'ends_at', 'end is required');
select col_not_null('public', 'booking_actions', 'request_id', 'idempotency key is required');
select has_column('public', 'calendar_entries', 'client_email', 'bookings use customer email');
select hasnt_column('public', 'calendar_entries', 'client_phone', 'customer phone is removed');
select hasnt_column('public', 'master_profile', 'phone_display', 'public display phone is removed');
select hasnt_column('public', 'master_profile', 'phone_href', 'public call phone is removed');

select * from finish();
rollback;
