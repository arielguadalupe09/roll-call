-- Grading configuration, Quiz/Written/Laboratory assessments, and major exams.
-- Grade computation and the printable record card are a later phase; this
-- migration only adds schema + config + score-entry storage.
-- Run this once in the SQL Editor after 0001-0004.

-- One row per class holding category weights + midterm/finals combination
-- weights + the recitation period cutoff. A trigger (below) guarantees every
-- class always has exactly one row, so reads can be a plain .single().
create table if not exists grading_configs (
  class_id uuid primary key references classes(id) on delete cascade,
  weight_assignment numeric not null default 0,
  weight_recitation numeric not null default 0,
  weight_quiz numeric not null default 0,
  weight_written numeric not null default 0,
  weight_laboratory numeric not null default 0,
  weight_major_exam numeric not null default 0,
  midterm_weight numeric not null default 50,
  finals_weight numeric not null default 50,
  midterm_end_date date,
  updated_at timestamptz default now()
);

-- Backfill a default row for every class that already exists.
insert into grading_configs (class_id)
select id from classes
on conflict (class_id) do nothing;

-- Auto-create a grading_configs row for every new class, mirroring the
-- handle_new_user trigger in 0001_init.sql.
create or replace function public.handle_new_class()
returns trigger as $$
begin
  insert into public.grading_configs (class_id) values (new.id)
  on conflict (class_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_class_created on classes;
create trigger on_class_created
  after insert on classes
  for each row execute procedure public.handle_new_class();

-- Period for assignments, so the (future) computation engine knows whether
-- an assignment counts toward the Midterm or Finals grade. Existing rows
-- default to 'midterm' -- the Assignments tab exposes a per-row period
-- editor so the teacher can correct pre-migration rows.
alter table assignments
  add column if not exists period text not null default 'midterm'
  check (period in ('midterm', 'finals'));

-- Unified Quiz / Written Activity / Laboratory Activity assessments -- these
-- three categories are structurally identical (title, optional date, max
-- score, period); only the label differs, so one table + a category
-- discriminator replaces three near-duplicate table pairs and lets the
-- future computation engine group by category in a single query.
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  category text not null check (category in ('quiz', 'written', 'laboratory')),
  title text not null,
  date date,
  max_score numeric not null default 100,
  period text not null default 'midterm' check (period in ('midterm', 'finals')),
  created_at timestamptz default now()
);

create table if not exists assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score numeric,
  updated_at timestamptz default now(),
  unique (assessment_id, student_id)
);

-- Major exams: always exactly 2 rows per class (Midterm Exam, Final Exam),
-- created lazily via upsert the first time the teacher sets a max score.
create table if not exists major_exams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  period text not null check (period in ('midterm', 'finals')),
  max_score numeric not null default 100,
  created_at timestamptz default now(),
  unique (class_id, period)
);

create table if not exists major_exam_scores (
  id uuid primary key default gen_random_uuid(),
  major_exam_id uuid not null references major_exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score numeric,
  updated_at timestamptz default now(),
  unique (major_exam_id, student_id)
);

create index if not exists assessments_class_idx on assessments (class_id);
create index if not exists assessment_scores_assessment_idx on assessment_scores (assessment_id);
create index if not exists major_exams_class_idx on major_exams (class_id);
create index if not exists major_exam_scores_exam_idx on major_exam_scores (major_exam_id);

alter table grading_configs enable row level security;
alter table assessments enable row level security;
alter table assessment_scores enable row level security;
alter table major_exams enable row level security;
alter table major_exam_scores enable row level security;

drop policy if exists "teacher manages own grading config" on grading_configs;
create policy "teacher manages own grading config" on grading_configs
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own assessments" on assessments;
create policy "teacher manages own assessments" on assessments
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own assessment scores" on assessment_scores;
create policy "teacher manages own assessment scores" on assessment_scores
  for all using (
    assessment_id in (
      select id from assessments where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    assessment_id in (
      select id from assessments where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

drop policy if exists "teacher manages own major exams" on major_exams;
create policy "teacher manages own major exams" on major_exams
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own major exam scores" on major_exam_scores;
create policy "teacher manages own major exam scores" on major_exam_scores
  for all using (
    major_exam_id in (
      select id from major_exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    major_exam_id in (
      select id from major_exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );
