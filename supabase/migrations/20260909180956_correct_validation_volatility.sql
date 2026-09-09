-- Text-to-time casts depend on PostgreSQL session settings, so STABLE is the
-- honest volatility level for this JSON schedule validator.
alter function public.valid_schedule_windows(jsonb) stable;
