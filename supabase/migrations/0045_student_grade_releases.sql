-- Release a term's grade to a single student (gradebook Overview -> the
-- "Release" button on a student's row), not only to the whole class.
-- A grade_releases row with student_id set applies to that student only;
-- student_id null is the class-wide release, as before. Per-student
-- releases reuse grade_release_views and grade_notifications, so the
-- student gets the same portal notice and email.
-- Run this once in the SQL Editor after 0001-0044.
alter table grade_releases add column if not exists student_id uuid references students(id) on delete cascade;

-- One class-wide release per term, plus at most one per student per term.
alter table grade_releases drop constraint if exists grade_releases_class_id_period_key;
create unique index if not exists grade_releases_class_period_uniq
  on grade_releases (class_id, period) where student_id is null;
create unique index if not exists grade_releases_student_period_uniq
  on grade_releases (class_id, period, student_id) where student_id is not null;

notify pgrst, 'reload schema';
