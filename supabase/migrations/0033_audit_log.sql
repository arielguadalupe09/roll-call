-- Audit trail: starts small on purpose -- a flat log of high-value teacher
-- actions (manual attendance edits, student add/remove, grading config
-- changes), not every mutation in the app. Extend the same
-- lib/audit-log.ts helper's call sites later to widen coverage.
-- Run this once in the SQL Editor after 0001-0032.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  action text not null,
  description text not null,
  class_id uuid references classes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_teacher_idx on audit_log (teacher_id, created_at desc);

alter table audit_log enable row level security;

-- A teacher sees their own actions; an admin (per the same
-- teachers.is_admin flag that already gates /admin/teachers) sees
-- everyone's -- an audit trail an admin can't actually audit isn't much
-- of one.
drop policy if exists "teacher reads own audit log" on audit_log;
create policy "teacher reads own audit log" on audit_log
  for select using (
    teacher_id = auth.uid()
    or exists (select 1 from teachers where id = auth.uid() and is_admin = true)
  );

drop policy if exists "teacher writes own audit log" on audit_log;
create policy "teacher writes own audit log" on audit_log
  for insert with check (teacher_id = auth.uid());
