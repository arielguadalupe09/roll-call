-- Lets a teacher opt in to sharing their weekly schedule with other
-- teachers as a read-only view (RBAC: viewers can SELECT, never
-- INSERT/UPDATE/DELETE another teacher's schedule_entries — the existing
-- "teacher manages own schedule" policy already restricts writes to the
-- owner, and this migration only adds an additional read grant).
-- Run this once in the SQL Editor after 0001-0012.

alter table teachers add column if not exists schedule_shared boolean not null default false;

drop policy if exists "teachers view shared schedules" on schedule_entries;
create policy "teachers view shared schedules" on schedule_entries
  for select
  using (
    teacher_id in (select id from teachers where schedule_shared = true)
  );
