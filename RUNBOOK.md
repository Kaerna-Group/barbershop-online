# Production Runbook

This runbook takes Barbershop Online from the public mock showcase to a real Supabase-backed booking service for one barber at one address.

## 1. Prepare Supabase environments

Create separate Supabase projects for testing and production. Never validate destructive changes against the production project first.

Authenticate the CLI, link the intended project, and inspect the link before applying migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Apply every file in <code>supabase/migrations</code> in order. Do not edit a migration that has already been applied; create a new migration for every schema change.

Review <code>supabase/seed.sql</code> before loading it through the SQL Editor. For a local Supabase stack, <code>npx supabase db reset</code> recreates the database and applies the seed.

Security rules:

- expose only the project URL and publishable/anon key to the frontend;
- never commit the service-role key, CLI access token, email-provider token, or worker secret;
- use separate credentials and secrets for testing and production.

## 2. Replace showcase data

Before accepting real appointments, replace every placeholder through the owner dashboard or reviewed SQL:

- barber name;
- public email and single Romanian address;
- optional venue name;
- services, durations, and prices in RON;
- weekly working hours;
- date-specific exceptions;
- minimum notice, booking horizon, change cutoff, and customer limit.

Prices are stored in minor currency units. Appointment timestamps are stored as <code>timestamptz</code> and displayed in <code>Europe/Bucharest</code>.

The product intentionally has no galleries, staff, branches, online payments, CRM, or marketplace entities.

## 3. Create the owner account

1. In Supabase Dashboard, open **Authentication → Users**.
2. Create an email user with a strong unique password.
3. Confirm the owner's email.
4. Copy the Auth user UUID.
5. Run this statement once in the SQL Editor:

```sql
update public.app_settings
set master_user_id = 'MASTER_AUTH_USER_UUID'
where singleton;
```

Verify that exactly one user is treated as the owner and that an ordinary customer cannot access owner RPCs or data.

Do not expose owner registration. Password recovery must target only the verified owner email.

## 4. Configure customer email authentication

In Supabase Auth:

1. Enable email sign-ups and passwordless email authentication.
2. Edit the **Magic Link** email template so the message contains <code>{{ .Token }}</code>; the frontend verifies this six-digit code as an email OTP.
3. Connect a production SMTP provider before accepting real appointments.
4. Add the allowed redirect URLs:
   - local: <code>http://localhost:5173/**</code>
   - production: <code>https://kaerna-group.github.io/barbershop-online/**</code>
5. Keep the OTP resend interval at 60 seconds or longer and the expiry at 60 minutes or less.
6. Test sign-in, sign-out, session restoration, and an expired code with a real email address in the test project.

The versioned template is stored at <code>supabase/templates/magic_link.html</code>. If Supabase rejects template customization on the current plan, configure custom SMTP first and then run <code>npx supabase config push</code> again.

Never log customer email addresses, OTP codes, access tokens, or session contents.

## 5. Deploy appointment notifications

The <code>send-notifications</code> Edge Function calls a generic HTTPS email endpoint with:

```json
{
  "to": "client@example.com",
  "subject": "Programare confirmată",
  "text": "Programare confirmată…",
  "idempotencyKey": "notification-job-uuid"
}
```

Set the production secrets and deploy the function:

```bash
npx supabase secrets set EMAIL_WEBHOOK_URL=https://provider.example/send
npx supabase secrets set EMAIL_WEBHOOK_TOKEN=replace-with-provider-token
npx supabase secrets set NOTIFICATION_WORKER_SECRET=replace-with-a-long-random-value
npx supabase functions deploy send-notifications
```

Create a Supabase Cron job that invokes the function once per minute. Send both headers:

- <code>Authorization: Bearer &lt;SUPABASE_SERVICE_ROLE_KEY&gt;</code> for Edge Function JWT verification;
- <code>x-worker-secret: &lt;NOTIFICATION_WORKER_SECRET&gt;</code> as the independent worker credential.

Store both values in Supabase Vault or protected scheduler configuration. Do not place them in a migration or repository file.

An email delivery failure must not delete or roll back an appointment. Notification jobs retry with increasing delay for up to five attempts.

## 6. Configure GitHub Pages

In the repository:

1. Open **Settings → Pages**.
2. Set the source to **GitHub Actions**.
3. Add repository secrets:
   - <code>VITE_SUPABASE_URL</code>
   - <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
4. Keep the repository variable <code>VITE_USE_MOCKS=true</code> while the site is a public showcase.

With mock mode enabled, the production bundle does not contact Supabase and all temporary changes reset after a reload.

Only after every launch check passes, change <code>VITE_USE_MOCKS</code> to <code>false</code> and redeploy from <code>main</code>.

## 7. Launch validation

Run the project checks:

```bash
npm run check
npm run lint
npm run format:check
npx supabase test db
```

Validate these scenarios against the test project:

1. Two simultaneous requests for the same slot: exactly one succeeds.
2. A retry with the same <code>request_id</code>: the original result is returned.
3. The three-upcoming-appointments limit remains correct under concurrency.
4. Rescheduling to an occupied slot fails without changing the original appointment.
5. A customer cannot read or mutate another customer's appointments.
6. Manual appointments and unavailable-time blocks cannot overlap.
7. The exact 2-hour notice and 12-hour change boundaries are accepted.
8. The final date at today + 30 days is accepted.
9. A daylight-saving transition does not change the displayed Bucharest local time.
10. An obsolete reminder is not sent after an appointment is moved.
11. Direct GitHub Pages links load correctly for all routes.
12. Romanian, English, and Russian copy fits on desktop and mobile layouts.

Before launch, also verify:

- the real address, services, prices, and schedule;
- the owner email recovery flow;
- email OTP and appointment-email delivery, retry behavior, and provider limits;
- RLS policies with customer and owner accounts;
- browser console and server logs contain no personal data or secrets;
- <code>VITE_USE_MOCKS=false</code> is present in the deployed build.

## 8. Backup and recovery

Confirm which automated backups are included in the selected Supabase plan. If they are unavailable, schedule encrypted logical PostgreSQL exports and store them outside the source repository.

Test restoration in a separate Supabase project first:

1. disable Cron and the notification Edge Function;
2. restore the database;
3. verify migrations, RLS, RPCs, and appointment counts;
4. test customer and owner access;
5. enable outbound email only after data validation succeeds.

Keep a documented recovery owner, backup location, retention period, and last successful restore-test date.

## 9. Rollback

If the real deployment shows incorrect availability, authorization, or notification behavior:

1. set <code>VITE_USE_MOCKS=true</code> and redeploy the public site;
2. disable the notification Cron job if messages may be wrong;
3. preserve logs without copying personal data into tickets or chat;
4. diagnose in the test project;
5. ship schema corrections as a new migration;
6. rerun the complete launch checklist before returning to live mode.

Do not rewrite applied migrations or restore production directly over the current database without a tested recovery plan.
