-- Adds a proper 4-state status to attendance records (Present/Absent/
-- Excused/Late), for the new manual attendance entry tool. Every existing
-- row was created via QR scan or self-check-in, both of which only ever
-- meant "present" -- the default backfills them correctly with no separate
-- data migration needed.
-- Run this once in the SQL Editor after 0001-0008.

alter table attendance add column if not exists status text not null default 'present'
  check (status in ('present', 'absent', 'excused', 'late'));

-- Widen the method constraint to allow manual entries alongside scan/self.
alter table attendance drop constraint if exists attendance_method_check;
alter table attendance add constraint attendance_method_check
  check (method in ('scan', 'self', 'manual'));
