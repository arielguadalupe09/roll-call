-- Adds an "essay" question type for open-ended, manually-graded responses.
-- Unlike the other types, essay answers are never auto-graded --
-- exam_answers.points_awarded/is_correct stay null until a teacher scores
-- them (both columns were already nullable for exactly this reason).
alter table exam_questions drop constraint if exists exam_questions_type_check;
alter table exam_questions add constraint exam_questions_type_check
  check (type in ('multiple_choice', 'true_false', 'identification', 'essay'));

-- Denormalized so the teacher results list and the student's post-submit
-- screen can both show "pending review" without joining exam_answers on
-- every read. Set at submit time (any answered essay question), cleared
-- once a teacher has entered a score for every essay answer.
alter table exam_attempts add column if not exists needs_grading boolean not null default false;
