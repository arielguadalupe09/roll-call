-- Recitation and activity tallies, logged via the same student QR scan
-- already used for attendance. Each scan is its own row (no unique
-- constraint) so counting rows per student/date/type gives the tally.
-- Run this once in the SQL Editor after 0001_init.sql and 0002_classroom_features.sql.

create table if not exists participation_logs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  type text not null check (type in ('recitation', 'activity')),
  label text,
  score smallint check (score between 1 and 5),
  date date not null,
  recorded_at timestamptz default now()
);

create index if not exists participation_class_date_idx
  on participation_logs (class_id, type, date);

alter table participation_logs enable row level security;

drop policy if exists "teacher manages own participation logs" on participation_logs;
create policy "teacher manages own participation logs" on participation_logs
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));
