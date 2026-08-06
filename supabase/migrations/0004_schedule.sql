-- Instructor's weekly room/time schedule. Teacher-owned directly (like
-- classes itself), not scoped through a class_id, since it spans the whole
-- week across every subject a teacher handles.
-- Run this once in the SQL Editor after 0001_init.sql.

create table if not exists schedule_entries (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  school_year text not null,
  semester text not null,
  day_of_week text not null check (day_of_week in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  start_time time not null,
  end_time time not null,
  subject_code text not null,
  section text,
  room text,
  created_at timestamptz default now()
);

create index if not exists schedule_entries_teacher_idx
  on schedule_entries (teacher_id, school_year, semester);

alter table schedule_entries enable row level security;

drop policy if exists "teacher manages own schedule" on schedule_entries;
create policy "teacher manages own schedule" on schedule_entries
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
