# Implementation Status

## Completed in the codebase

- [x] React, Vite, Tailwind CSS foundation and application routes
- [x] Responsive booking flow without photography
- [x] Customer phone sign-in and verification
- [x] Upcoming appointments, history, rescheduling, and cancellation
- [x] Owner dashboard and manual appointments
- [x] Weekly schedule, date exceptions, and unavailable-time blocks
- [x] Profile, booking-rule, and service settings
- [x] PostgreSQL schema, RLS policies, and narrow RPC functions
- [x] Overlap, duplicate-request, and stale-version protection
- [x] Notification queue and Edge Function
- [x] Frontend tests, pgTAP smoke test, and CI
- [x] GitHub Pages deployment and SPA redirects
- [x] Romanian, English, and Russian localization

## Showcase environment

- [x] Supabase project linked and migrations deployed
- [x] Public GitHub Pages demo deployed in mock mode
- [x] Demo customer and owner journeys enabled
- [x] Repository documentation and presentation assets prepared

## Required before accepting real appointments

- [ ] Create the production owner in Supabase Auth and store the user's UUID
- [ ] Replace the placeholder name, address, phone, services, prices, and schedule
- [ ] Connect an SMS provider for phone OTP delivery
- [ ] Configure the SMS notification webhook, server-side secrets, and Cron worker
- [ ] Validate concurrent booking behavior against the staging database
- [ ] Test backup restoration in a separate Supabase project
- [ ] Complete the production checklist in <code>RUNBOOK.md</code>
- [ ] Set <code>VITE_USE_MOCKS=false</code> and verify the deployed build
