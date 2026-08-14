-- Optional third grading period ("Prelims") on top of the existing
-- Midterm/Finals split. Off by default everywhere -- a class only gets a
-- third period, weight, and cutoff date once a teacher opts in via
-- grading_configs.use_prelims. Existing classes are unaffected.
-- Run this once in the SQL Editor after 0001-0014.

alter table grading_configs add column if not exists use_prelims boolean not null default false;
alter table grading_configs add column if not exists prelim_weight numeric not null default 0;
alter table grading_configs add column if not exists prelim_end_date date;

-- Lets a teacher's newly-created classes default to 3 periods instead of
-- flipping the Setup tab checkbox by hand every time.
alter table teachers add column if not exists default_use_prelims boolean not null default false;

alter table assignments drop constraint if exists assignments_period_check;
alter table assignments add constraint assignments_period_check
  check (period in ('prelim', 'midterm', 'finals'));

alter table assessments drop constraint if exists assessments_period_check;
alter table assessments add constraint assessments_period_check
  check (period in ('prelim', 'midterm', 'finals'));

alter table major_exams drop constraint if exists major_exams_period_check;
alter table major_exams add constraint major_exams_period_check
  check (period in ('prelim', 'midterm', 'finals'));
