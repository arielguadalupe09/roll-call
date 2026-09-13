-- Distinguishes a quiz from a major exam within the same online-exam
-- system (identical builder/taking/grading logic either way -- this is
-- just a label for the list and results views).
alter table exams add column if not exists kind text not null default 'quiz'
  check (kind in ('quiz', 'major_exam'));
