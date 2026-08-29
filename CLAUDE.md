# Roll Call

QR-code attendance and grading for a university teacher portal (Pampanga State University branding baked into some record-card/DHVSU-export copy, but not hardcoded to it).

## Stack

- Next.js (App Router) + TypeScript, Tailwind v4 (see `app/globals.css` for the theme tokens: `chalk`/`paper`/`ink`/`rule`/`brass`/`danger`/`teal`, plus `chart-good`/`chart-warning`/`chart-critical` for data viz)
- Supabase (Postgres + Auth + Realtime + Storage)
- Deployed on Vercel

## Auth model

Everything under `app/(app)/` is an authenticated teacher route, RLS-scoped via `class_id in (select id from classes where teacher_id = auth.uid())` (see `supabase/migrations/0001_init.sql`). Two routes are deliberately public/unauthenticated and bypass RLS via `lib/supabase/admin.ts`'s service-role client instead:

- `app/checkin/page.tsx` + `app/api/checkin/confirm/route.ts` — student self check-in
- `app/(app)/scan/[classId]/scan-client.tsx` — teacher-facing QR scanner (authenticated, but scans student codes directly)

`students.code` is **globally unique** (not per-class), so a scanned/typed code alone resolves both the student and their class without a class param.

## Database migrations

**Applied by hand in the Supabase SQL Editor — there is no working `supabase db push` pipeline yet.** Every migration in `supabase/migrations/` needs to be manually pasted and run in the dashboard's SQL Editor before deploying code that depends on it. Always confirm with the user that a new migration has actually been run before pushing/deploying code that reads/writes the new column — deploying first breaks production with "column does not exist" errors.

Known issues if this ever gets wired up to the CLI properly:
- Two files share the `0010` prefix (`0010_class_archive.sql`, `0010_class_record_metadata.sql`) — needs resolving before the CLI's migration tracking (which uses the prefix as a unique version) can work.
- The CLI's expected format is a 14-digit timestamp prefix; this repo uses simple `0001`, `0002`, ... — would need a batch rename.
- The Supabase CLI login used in this environment does not have access to whichever Supabase org/project actually backs this app's `.env.local` credentials — confirmed by checking two visible projects, neither of which has this app's schema. Whoever picks this up needs to `supabase login` with the right account first.

## Deploy

Vercel's git-triggered auto-deploy has been unreliable (delayed by 15+ minutes, or didn't fire at all, multiple times). If a push doesn't produce a new deployment within a minute or two, don't wait — deploy directly:

```bash
NODE_EXTRA_CA_CERTS="$PWD/certs/corporate-proxy-ca.pem" npx vercel --prod --yes
```

(The `NODE_EXTRA_CA_CERTS` env var is needed in this dev environment specifically — it sits behind a corporate proxy that re-signs TLS certs; `certs/corporate-proxy-ca.pem` is that proxy's CA. Also required for `npm run dev` / `next build` locally, already wired into `package.json`'s `dev` script.)

Reconnecting the Git integration if the webhook seems stuck: `vercel git disconnect --yes` then `vercel git connect`.

## Conventions learned the hard way

- **Student names**: always `Lastname, Firstname M.I.` — a trailing middle name gets abbreviated to a single initial + period everywhere (manual add, edit, bulk import). Logic lives in `lib/name-format.ts` (`toLastNameFirst`, `namesFromImportRows`, `namesFromImportMatrix`). Bulk import auto-detects letterhead blocks above the real header row, and falls back to assuming bare Last/First/Middle column order when there's no header row at all.
- **Print layouts need fixed-height slots.** Anything that gets printed in a grid (QR cards, record cards) needs subject/name text in a fixed-height container (`line-clamp` + explicit height), or row heights vary with text length and the print layout becomes inconsistent across classes/students.
- **Self check-in device lock**: a student's code permanently binds to whichever device (`students.device_id`, a client-generated UUID in `localStorage`) first successfully checks them in — prevents a classmate checking someone in from their own phone. Checked in both directions in `app/api/checkin/confirm/route.ts` (code→device *and* device→code) — an earlier version only checked one direction and let one phone check in unlimited different (first-time) students.
- **"Today" is never computed server-side for check-in gating** — this app runs in UTC on Vercel but the school is UTC+8; matching against a server-computed date would misidentify the date for hours around midnight. Gate on "is there a currently open session" instead, and use the session's own `date` field (set by the teacher, client-side, in their local time) for the actual attendance record.

## Commands

```bash
npx vitest run          # unit tests (lib/*.test.ts only — no route/component tests)
npx eslint .
npx tsc --noEmit -p .
NODE_EXTRA_CA_CERTS=./certs/corporate-proxy-ca.pem npx next build
```

## AI features

`app/api/assistant/route.ts` — a per-class "ask about this class" Q&A endpoint using the Claude API (`claude-haiku-4-5`, single-turn, no persisted history to keep cost down). Requires `ANTHROPIC_API_KEY` in the environment; degrades to a clear 503 if unset rather than failing silently. Builds its context from existing `lib/dashboard-insights.ts` functions (`computeClassStats`, `computeInsights`) rather than a fresh data pipeline — reuse those before adding new ones if extending this.
