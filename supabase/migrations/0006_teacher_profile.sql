-- Adds a display name for teachers, used on printable documents (e.g. the
-- Student Individual Record Card's "Instructor" field) instead of a raw
-- email address.
-- Run this once in the SQL Editor after 0001-0005.

alter table teachers add column if not exists full_name text;

-- The existing policy from 0001_init.sql only allows SELECT ("teacher reads
-- own row"); add UPDATE so a teacher can set their own display name.
drop policy if exists "teacher updates own row" on teachers;
create policy "teacher updates own row" on teachers
  for update using (id = auth.uid()) with check (id = auth.uid());
