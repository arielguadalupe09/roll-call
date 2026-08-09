-- Replaces the blanket "share with every teacher" toggle (0013) with
-- per-teacher sharing: an owner picks exactly who can view their schedule.
-- RBAC unchanged in spirit — viewers only ever get SELECT via this table;
-- writes to schedule_entries stay restricted to the owner by the existing
-- "teacher manages own schedule" policy.
-- Run this once in the SQL Editor after 0001-0013.

create table if not exists schedule_shares (
  owner_id uuid not null references teachers(id) on delete cascade,
  viewer_id uuid not null references teachers(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

alter table schedule_shares enable row level security;

drop policy if exists "teacher manages own schedule shares" on schedule_shares;
create policy "teacher manages own schedule shares" on schedule_shares
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "teachers view shared schedules" on schedule_entries;
create policy "teachers view schedules shared with them" on schedule_entries
  for select
  using (
    exists (
      select 1 from schedule_shares
      where schedule_shares.owner_id = schedule_entries.teacher_id
        and schedule_shares.viewer_id = auth.uid()
    )
  );

alter table teachers drop column if exists schedule_shared;
