-- Locks a student's self check-in code to whichever device it's first
-- successfully used from, so a classmate can't check an absent student in
-- from their own phone. Nullable, no uniqueness constraint -- binding is
-- per student, not a global one-device-one-student rule.
-- Run this once in the SQL Editor after 0001-0015.

alter table students add column if not exists device_id text;
