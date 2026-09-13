-- Online exam/quiz module: teacher-authored objective questions (multiple
-- choice / true-false / identification), student-facing timed attempts,
-- rule-based auto-grading, and a tab-switch/window-blur violation log with
-- an optional single snapshot per violation (captured client-side, only
-- when a violation actually fires -- not continuous recording).

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  period text not null check (period in ('prelim', 'midterm', 'finals')),
  duration_minutes integer not null,
  published boolean not null default false,
  available_from timestamptz,
  available_until timestamptz,
  created_at timestamptz default now()
);

create index if not exists exams_class_idx on exams (class_id);

create table if not exists exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  prompt text not null,
  type text not null check (type in ('multiple_choice', 'true_false', 'identification')),
  points numeric not null default 1,
  order_index integer not null default 0,
  -- Only for true_false/identification -- one or more acceptable answers,
  -- separated by "|", matched case-insensitively/trimmed. Never sent to a
  -- student-facing route before grading.
  correct_answer text,
  created_at timestamptz default now()
);

create index if not exists exam_questions_exam_idx on exam_questions (exam_id);

create table if not exists exam_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references exam_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0
);

create index if not exists exam_options_question_idx on exam_options (question_id);

create table if not exists exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric,
  total_points numeric,
  violation_count integer not null default 0,
  unique (exam_id, student_id)
);

create index if not exists exam_attempts_exam_idx on exam_attempts (exam_id);

create table if not exists exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references exam_questions(id) on delete cascade,
  selected_option_id uuid references exam_options(id) on delete set null,
  answer_text text,
  is_correct boolean,
  points_awarded numeric,
  unique (attempt_id, question_id)
);

create index if not exists exam_answers_attempt_idx on exam_answers (attempt_id);

create table if not exists exam_violations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  type text not null check (type in ('tab_switch', 'window_blur', 'fullscreen_exit', 'copy_paste')),
  occurred_at timestamptz not null default now(),
  snapshot_path text
);

create index if not exists exam_violations_attempt_idx on exam_violations (attempt_id);

alter table exams enable row level security;
alter table exam_questions enable row level security;
alter table exam_options enable row level security;
alter table exam_attempts enable row level security;
alter table exam_answers enable row level security;
alter table exam_violations enable row level security;

drop policy if exists "teacher manages own exams" on exams;
create policy "teacher manages own exams" on exams
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own exam_questions" on exam_questions;
create policy "teacher manages own exam_questions" on exam_questions
  for all using (
    exam_id in (
      select id from exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    exam_id in (
      select id from exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

drop policy if exists "teacher manages own exam_options" on exam_options;
create policy "teacher manages own exam_options" on exam_options
  for all using (
    question_id in (
      select eq.id from exam_questions eq
      join exams e on e.id = eq.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    question_id in (
      select eq.id from exam_questions eq
      join exams e on e.id = eq.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

drop policy if exists "teacher manages own exam_attempts" on exam_attempts;
create policy "teacher manages own exam_attempts" on exam_attempts
  for all using (
    exam_id in (
      select id from exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    exam_id in (
      select id from exams where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

drop policy if exists "teacher manages own exam_answers" on exam_answers;
create policy "teacher manages own exam_answers" on exam_answers
  for all using (
    attempt_id in (
      select ea.id from exam_attempts ea
      join exams e on e.id = ea.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    attempt_id in (
      select ea.id from exam_attempts ea
      join exams e on e.id = ea.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

drop policy if exists "teacher manages own exam_violations" on exam_violations;
create policy "teacher manages own exam_violations" on exam_violations
  for all using (
    attempt_id in (
      select ea.id from exam_attempts ea
      join exams e on e.id = ea.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    attempt_id in (
      select ea.id from exam_attempts ea
      join exams e on e.id = ea.exam_id
      where e.class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

-- Private bucket for the single violation snapshot, when the student's
-- browser had camera permission at the moment a violation fired.
-- Path convention: {class_id}/{exam_id}/{student_id}/{violation_id}.jpg
insert into storage.buckets (id, name, public)
values ('exam-snapshots', 'exam-snapshots', false)
on conflict (id) do nothing;

drop policy if exists "teacher r own exam snapshots" on storage.objects;
create policy "teacher r own exam snapshots" on storage.objects
  for all
  using (
    bucket_id = 'exam-snapshots'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    bucket_id = 'exam-snapshots'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  );
