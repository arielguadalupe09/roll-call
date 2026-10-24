-- Per-student, per-term grade adjustments: the DHVSU class record's "+"
-- Adjustments column (Midterm/Final Term sheets, column AR), which the
-- template adds straight onto the term grade. Entered in the gradebook
-- Overview; the export writes them into AR.
-- Run this once in the SQL Editor after 0001-0040.
create table if not exists grade_adjustments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  period text not null check (period in ('prelim', 'midterm', 'finals')),
  points numeric not null,
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, period)
);

alter table grade_adjustments enable row level security;

drop policy if exists "teacher manages own grade adjustments" on grade_adjustments;
create policy "teacher manages own grade adjustments" on grade_adjustments
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

notify pgrst, 'reload schema';
