# GAINS

GAINS (Grading & Attendance Intelligent Network System) — QR-code attendance and grading for a university teacher portal (Pampanga State University branding baked into some record-card/DHVSU-export copy, but not hardcoded to it). Renamed from "Roll Call"; that name may still linger in old commit messages, code comments, and internal identifiers (localStorage keys, migration comments) that were left as-is since changing them has no user-visible effect.

## Stack

- Next.js (App Router) + TypeScript, Tailwind v4 (see `app/globals.css` for the theme tokens: `chalk`/`paper`/`ink`/`rule`/`brass`/`danger`/`success`, plus `chart-good`/`chart-warning`/`chart-critical` for data viz)
- Supabase (Postgres + Auth + Realtime + Storage)
- Deployed on Vercel

## Auth model

Everything under `app/(app)/` is an authenticated teacher route, RLS-scoped via `class_id in (select id from classes where teacher_id = auth.uid())` (see `supabase/migrations/0001_init.sql`). Two routes are deliberately public/unauthenticated and bypass RLS via `lib/supabase/admin.ts`'s service-role client instead:

- `app/student/page.tsx` + `app/api/student/profile/route.ts` — the student portal, which also performs self check-in (marks the student present) as a side effect of loading their profile whenever their teacher has a session open. `app/checkin/page.tsx` is a bare redirect to `/student`, kept only so old bookmarks/home-screen installs/printed instructions still land somewhere real.
- `app/(app)/scan/[classId]/scan-client.tsx` — teacher-facing QR scanner (authenticated, but scans student codes directly)

`students.code` is **globally unique** (not per-class), so a scanned/typed code alone resolves both the student and their class without a class param.

## Database migrations

**Applied by hand in the Supabase SQL Editor — there is no working `supabase db push` pipeline yet.** Every migration in `supabase/migrations/` needs to be manually pasted and run in the dashboard's SQL Editor before deploying code that depends on it. Always confirm with the user that a new migration has actually been run before pushing/deploying code that reads/writes the new column — deploying first breaks production with "column does not exist" errors.

**Guard:** `npm run build` runs `scripts/check-migrations.mjs` first (npm `prebuild`), and fails if any migration file is newer than `supabase/last-applied-migration.txt`. After running a new migration in the SQL Editor, set that file to its number and commit — this is what stops a deploy from shipping code ahead of its schema.

The marker file only records the *newest* number, so it can't see an older migration that was skipped (0015/0023/0033 went unapplied in production for weeks while later ones ran). So the same script also checks the live database when Supabase credentials are available (Vercel's build env, or `.env.local`): `lib/schema-check.mjs` replays every migration's `create table` / `add column` / `drop column` / `drop table` and probes PostgREST for each expected table/column, failing the build with the migration names to run. Only tables/columns are verified, not constraints or policies. Network/auth errors only warn, so a Supabase hiccup doesn't block a deploy. The weekly data audit runs the same check (`missing_migration` findings).

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

`.github/workflows/deploy-fallback.yml` automates that: 3 minutes after each push to `main` it checks Vercel for a deployment of that commit and deploys directly if none exists (needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` repo secrets).

Reconnecting the Git integration if the webhook seems stuck: `vercel git disconnect --yes` then `vercel git connect`.

## Conventions learned the hard way

- **Student names**: always `Lastname, Firstname M.I.` — a trailing middle name gets abbreviated to a single initial + period everywhere (manual add, edit, bulk import). Logic lives in `lib/name-format.ts` (`toLastNameFirst`, `namesFromImportRows`, `namesFromImportMatrix`). Bulk import auto-detects letterhead blocks above the real header row, and falls back to assuming bare Last/First/Middle column order when there's no header row at all.
- **Print layouts need fixed-height slots.** Anything that gets printed in a grid (QR cards, record cards) needs subject/name text in a fixed-height container (`line-clamp` + explicit height), or row heights vary with text length and the print layout becomes inconsistent across classes/students.
- **Self check-in device lock is confirm-based, not a hard block.** A student's code binds to whichever device (`students.device_id`, a client-generated UUID in `localStorage`) last confirmed using it. `lib/student-device-lock.ts`'s `checkDeviceLock` checks both directions (code→device *and* device→code — an early version only checked one direction and let one phone check in unlimited different first-time students) but returns `needsConfirmation: true` instead of an unrecoverable error on a mismatch; `app/_components/student-code-entry.tsx` surfaces this as a "Continue anyway" button that retries with `confirmDeviceSwitch: true`, which `rebindDevice` then honors unconditionally. Went this route after data showed most mismatches were students' own phones losing their remembered id (Safari/PWA storage partitioning, cache clears) rather than actual device sharing — the earlier hard block meant teachers had to manually reset a student's device before nearly every class.
- **`/student` also handles self check-in.** Loading a profile there marks the student present as a side effect if their teacher has a session open (`app/api/student/profile/route.ts`) — `/checkin` used to be a separate standalone page/PWA for this and now just redirects to `/student`, which absorbed its announcements list and "Install app" prompt. A remembered code from `localStorage` is never auto-loaded into a full profile on mount (that page's own `STUDENT_CODE_CONFIRMED_KEY` `sessionStorage` marker decides whether to trust it silently or show a "Welcome back, is this you?" prompt first) — the /student page previously did trust it silently, which leaked one student's grades to the next person on a shared device.
- **"Today" is never computed server-side for check-in gating** — this app runs in UTC on Vercel but the school is UTC+8; matching against a server-computed date would misidentify the date for hours around midnight. Gate on "is there a currently open session" instead, and use the session's own `date` field (set by the teacher, client-side, in their local time) for the actual attendance record.

## Grading (DHVSU)

Every grade in the app is computed the way the official DHVSU class record template (`lib/templates/dhvsu-1st-3rd-year.xlsx`, hidden `MidCom`/`FinCom` sheets) computes it, so the gradebook Overview, student portal and the `.xlsx` export always agree. `lib/dhvsu-grade.ts` is the single source of truth: `buildTermPlan` decides which item goes in which template slot (5 per category, 4 for Major Exam; extra items are merged), and both `computeDhvsuGrades` and `lib/dhvsu-export.ts` consume that same plan. Rules mirrored from the template: per-item transmutation via `New Transmutation` (`lib/dhvsu-tables.ts`, generated from the template), missing score = flat 0, ungraded category = 0 (no renormalization), attendance P5/L3/E2/A0, final = FLOOR(term x term weight), FA when lates/3 + absences >= 20% of class dates. Grading structure mirrors the template's Info sheet (`lib/grading-criteria.ts`): Attendance + Major Exam + Class Standing, where Class Standing is five teacher-named, teacher-weighted criteria (Setup: name from DHVSU's own list, 0-60% in 5% steps; Course Type presets from the template's Version sheet). Each criterion is a fixed internal slot -- `quiz`, `recitation`, `written`, `laboratory`, `other` (assessments.category + `weight_*` column) -- with a display name in `grading_configs.criteria_labels`, so renaming never touches scores. Slot -> Info row / term-sheet column: quiz 41/H, recitation 42/N, written 43/T, laboratory 44/Z, other 45/AF; Major Exam AM. Each term can have a written and a laboratory major exam (`major_exams.kind`, migration 0040) -- both are slots of the Major Exam block (AM:AP), so with both each counts half the Major Exam weight. Tabs, the top Gradebook menu, Overview, record cards, the student portal and the export all take names from `criterionLabel`. **Assignments are not graded** -- Attendance replaced them (migration 0037); the Assignments page/submissions still exist. The QR scanner has no Recitation mode -- recitation is graded only from Gradebook → Recitation items (scanned recitation and its data were removed for good). Per-student, per-term **Adjustments** (`grade_adjustments`, migration 0041) are the template's "+" column AR: entered inline in Overview, added straight onto the term grade (MidCom/FinCom!AS), and written into AR by the export. **Grade release:** term grades are hidden in the student portal until the teacher releases that term in Overview (`grade_releases`, migration 0042; gating in `lib/grade-release.ts`, final rating only once every term is released). Each release gives every student a one-time "your grade is out" notice in /student (`grade_release_views` marks it seen). Students have no email/phone, so the portal is the only channel. The export writes the class's Setup weights into `Info!B38:B45` and `B34/B35`, clears the template's leftover sample data, and patches the Class Standing column's hardcoded `/60`.

Real Microsoft Excel is the ground truth (HyperFormula floors `(29/50)*100` to 57 where Excel gives 58; `lib/dhvsu-grade.ts` follows Excel). When changing either side, re-verify by evaluating an exported file's formulas (e.g. HyperFormula) against `computeDhvsuGrades` -- the two must match per student.

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

## Scheduled data audit

`vercel.json` runs `app/api/cron/data-audit/route.ts` every Monday 00:00 UTC. It's read-only (service-role client, logic in `lib/data-audit.ts`): duplicate student names within a class, sessions open >24h, unsubmitted exam attempts >24h, non-archived classes with no students, and migrations whose tables/columns are missing from the live database. Requires `CRON_SECRET` in Vercel's environment variables (otherwise the route returns 401). Findings go to Vercel's runtime logs only — there's no notification channel yet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
