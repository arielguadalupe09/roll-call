-- Extends the online-exam feature to cover Written Activity and Laboratory
-- Activity kinds (previously quiz/major_exam only), matching the vocabulary
-- assessments.category already uses so lib/exam-gradebook-sync.ts can route
-- these into the same manual-gradebook tables. Written/laboratory activities
-- have no countdown timer (open/close window only), so duration_minutes is
-- widened to allow null. A new file_upload question type lets a student
-- submit a file (lab report, photo, code) instead of a typed answer.
alter table exams drop constraint if exists exams_kind_check;
alter table exams add constraint exams_kind_check check (kind in ('quiz', 'major_exam', 'written', 'laboratory'));

alter table exams alter column duration_minutes drop not null;

alter table exam_questions drop constraint if exists exam_questions_type_check;
alter table exam_questions add constraint exam_questions_type_check
  check (type in ('multiple_choice', 'true_false', 'identification', 'essay', 'file_upload'));

alter table exam_answers add column if not exists file_path text;

-- Tracks whether a fully-graded score has been shown to the student yet in
-- their portal, so the student page can render a one-time "New" badge.
alter table exam_attempts add column if not exists score_seen_at timestamptz;

-- Private bucket for student-submitted files -- distinct from exam-snapshots,
-- which holds anti-cheating webcam captures, not activity submissions.
insert into storage.buckets (id, name, public)
values ('exam-submissions', 'exam-submissions', false)
on conflict (id) do nothing;

drop policy if exists "teacher reads own exam submissions" on storage.objects;
create policy "teacher reads own exam submissions" on storage.objects
  for select using (
    bucket_id = 'exam-submissions'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  );
