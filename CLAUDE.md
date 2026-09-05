# GAINS

GAINS (Grading & Attendance Intelligent Network System) — QR-code attendance and grading for a university teacher portal (Pampanga State University branding baked into some record-card/DHVSU-export copy, but not hardcoded to it). Renamed from "Roll Call"; that name may still linger in old commit messages, code comments, and internal identifiers (localStorage keys, migration comments) that were left as-is since changing them has no user-visible effect.

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

Two earlier LLM attempts were tried and removed: a server-side Anthropic implementation (needed a paid `ANTHROPIC_API_KEY`) and a fully client-side `@mlc-ai/web-llm` (WebGPU) one (unreliable multi-hundred-MB model download in the browser, too slow/flaky for teachers in practice). Any *new* LLM dependency (a different provider, a different model shape) still shouldn't be reintroduced without discussing the trade-off with the user first — the one exception below was discussed and deliberately scoped to avoid both failure modes.

In their place, `app/(app)/dashboard/classes/[classId]/class-analytics.tsx` gives each class page a rule-based analytics panel — average attendance (`AttendanceRing`), week-over-week trend, a per-session attendance bar chart (`SessionTrendChart` in `dashboard-charts.tsx`), the same warning/info insights shown on the dashboard, and a list of students below the low-attendance threshold. All of it is plain computation over Supabase data, server-rendered, no model or network call involved:

- `lib/dashboard-insights.ts` is the single source of truth for this logic — `computeClassStats`/`computeInsights` (shared with the dashboard's aggregate view) plus `computeSessionSeries`/`lowAttendanceStudentNames` (added for the per-class panel). Extend these rather than duplicating logic in a component.
- Data (`students`/`attendance`/`grading_configs`) is fetched server-side in `classes/[classId]/page.tsx`, same pattern as `dashboard/page.tsx` — no client component needed for this panel.

### Jarvis assistant

`app/_components/jarvis-assistant.tsx` is a floating chat widget (mounted in `app/(app)/layout.tsx`, so it's on every authenticated page) for navigating the app and asking about class data — "open dashboard", "start a session for `<class>`", "how's this class doing", "who's below attendance", "what have you learned". It's rule-based, not a model:

- `lib/voice-commands.ts` — pure keyword/pattern parser (`parseVoiceCommand`) that classifies typed text into a command, resolving class names against the live class list (exact → substring → word-overlap, plus a learned-alias shortcut) via `matchClass`/`resolveClassChoice`. Fully unit tested (`lib/voice-commands.test.ts`) — extend the pattern tables here for new phrasings rather than adding ad hoc string checks in the component.
- `lib/voice-memory.ts` — the "learned alias" memory: `localStorage`-backed, `spoken phrase → classId`, written whenever a spoken/typed class name resolves (cleanly or via disambiguation click) and consulted before fuzzy matching next time. `describeClassAliases` renders it back as text for the "what have you learned" command. Not ML — just a lookup table that grows from your own corrections.
- `lib/jarvis-analytics.ts` — formats `lib/dashboard-insights.ts` output (attendance %, trend, low-attendance count, warnings) into chat replies, for both a single class and an aggregate-across-all-classes view.

**The one real LLM dependency in this app** is the fallback for text the rule-based parser can't classify (`VoiceCommand` type `"unrecognized"`):

- `app/api/jarvis/route.ts` — a server-side-only proxy to Groq's free-tier OpenAI-compatible chat completions API (`GROQ_API_KEY` env var, never exposed client-side). Requires the teacher to be signed in (checked via `createClient()` from `lib/supabase/server`, same pattern as `app/api/export/dhvsu-class-record/[classId]/route.ts`) — this route would otherwise be an open, unauthenticated proxy to a rate-limited third-party API.
- `lib/jarvis-ai.ts` — `buildJarvisSystemPrompt` builds the system prompt, grounded in a live analytics snapshot (same `formatAnalyticsAnswer` output already used for rule-based answers) so replies reflect real numbers instead of guessing.
- **Degrades silently with zero config**: if `GROQ_API_KEY` isn't set (or the call fails for any reason), `askJarvisAI` in `jarvis-assistant.tsx` falls back to the plain "I didn't understand ..." message — the app works identically to the fully rule-based version with no key present. `GROQ_API_KEY` needs to be set in both `.env.local` (local dev) and Vercel's project environment variables (production) to activate it; it isn't set anywhere by default.
