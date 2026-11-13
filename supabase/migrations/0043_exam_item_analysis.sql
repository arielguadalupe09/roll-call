-- Item analysis for in-person (paper) major exams. The teacher sets how many
-- items the exam has and, per student, types the item numbers they got
-- wrong; the gradebook then computes each item's difficulty and
-- discrimination index and lists struggling students (lib/item-analysis.ts).
-- A student with no row hasn't been checked yet; an empty array means a
-- perfect paper. Optionally (ZipGrade-style) the exam has an answer key and
-- each paper stores the letters the student chose, which adds a per-option
-- response distribution; wrong_items is still derived and stored then.
-- Run this once in the SQL Editor after 0001-0042.
alter table major_exams add column if not exists item_count integer
  check (item_count is null or (item_count between 1 and 500));
-- One letter A-E per item, e.g. 'ABDCA'; null = no key (wrong-items mode).
alter table major_exams add column if not exists answer_key text
  check (answer_key is null or answer_key ~ '^[A-E]+$');

create table if not exists major_exam_item_responses (
  id uuid primary key default gen_random_uuid(),
  major_exam_id uuid not null references major_exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  -- 1-based item numbers the student got wrong.
  wrong_items integer[] not null default '{}',
  -- Letters the student chose, one per item ('-' = blank); null when only
  -- wrong items were typed.
  answers text check (answers is null or answers ~ '^[A-E-]+$'),
  updated_at timestamptz not null default now(),
  unique (major_exam_id, student_id)
);

-- In case an earlier draft of this migration already created the table.
alter table major_exam_item_responses add column if not exists answers text
  check (answers is null or answers ~ '^[A-E-]+$');

create index if not exists major_exam_item_responses_exam_idx on major_exam_item_responses (major_exam_id);

alter table major_exam_item_responses enable row level security;

drop policy if exists "teacher manages own major exam item responses" on major_exam_item_responses;
create policy "teacher manages own major exam item responses" on major_exam_item_responses
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

notify pgrst, 'reload schema';
