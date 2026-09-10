-- Safe sample content. Replace every placeholder before accepting real clients.

insert into public.master_profile (
  singleton, name, short_intro, email, address_line, venue_label
) values (
  true,
  'Programare la frizer',
  'Un singur client, timpul rezervat doar pentru tine.',
  'programare@barber.test',
  'Adresa va fi completată înainte de lansare',
  null
)
on conflict (singleton) do update set
  name = excluded.name,
  short_intro = excluded.short_intro,
  email = excluded.email,
  address_line = excluded.address_line,
  venue_label = excluded.venue_label;

insert into public.app_settings (
  singleton, timezone, currency, slot_step_minutes, min_lead_hours,
  booking_horizon_days, change_cutoff_hours, max_future_bookings,
  reminder_hours, booking_enabled
) values (
  true, 'Europe/Bucharest', 'RON', 30, 2, 30, 12, 3, 24, true
)
on conflict (singleton) do nothing;

insert into public.services (
  id, name, description, price_minor, duration_minutes, active, sort_order
) values
  ('11111111-1111-4111-8111-111111111111', 'Tuns', 'Consultație scurtă, tuns și finisare.', 8000, 60, true, 1),
  ('22222222-2222-4222-8222-222222222222', 'Tuns + barbă', 'Tuns, contur și aranjarea bărbii.', 12000, 90, true, 2),
  ('33333333-3333-4333-8333-333333333333', 'Barbă', 'Contur, scurtare și finisare.', 5000, 30, true, 3)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_minor = excluded.price_minor,
  duration_minutes = excluded.duration_minutes,
  active = excluded.active,
  sort_order = excluded.sort_order;

insert into public.weekly_schedule (weekday, starts_at, ends_at)
values
  (1, '09:00', '18:00'),
  (2, '09:00', '18:00'),
  (3, '09:00', '18:00'),
  (4, '09:00', '18:00'),
  (5, '09:00', '18:00'),
  (6, '10:00', '14:00')
on conflict (weekday, starts_at, ends_at) do nothing;
