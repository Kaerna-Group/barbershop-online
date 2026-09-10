# Project Working Rules

## Product boundaries

This product provides appointment booking for one barber at one address. Do not add barber selection, salons, branches, payments, CRM, analytics, or photography without a new explicit request from the owner.

## Architecture

- <code>app</code> knows about every layer and assembles the routes.
- <code>pages</code> compose pages from <code>features</code> and <code>shared</code>.
- <code>features</code> contain complete user actions.
- <code>shared</code> must not import <code>pages</code> or <code>features</code>.
- Do not duplicate server-side availability rules in the frontend as a source of truth.
- Every schema change must be a new migration; never rewrite an applied migration.
- Direct client writes to the calendar, schedule, or settings are forbidden; use RPC functions.

## Code

- Use strict TypeScript and avoid <code>any</code> in application code.
- Localize all visible interface text; Romanian is the default language.
- Store appointment dates as <code>timestamptz</code> and display them in <code>Europe/Bucharest</code>.
- Store prices in minor currency units.
- Mutations must expose explicit loading, error, and success states.
- New interactive elements must support keyboard use and have an accessible name.
- Never write customer email addresses, OTP codes, tokens, or secrets to logs.
- Do not use <code>localStorage</code> as the customer-data store.

Run <code>npm run check</code> before making changes. After changes, rerun every check relevant to the affected code.
