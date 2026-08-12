-- Course/institution metadata needed to fill the official DHVSU Class Record
-- Excel export -- not used anywhere else in the app, so every column is
-- nullable and only matters at export time.
-- Run this once in the SQL Editor after 0001-0009.

-- Must exactly match one of the template's three program-type strings
-- (its grade-computation formulas branch on this exact text) -- enforced
-- with a check constraint since a typo here would silently break every
-- student's grade calculation in the exported sheet.
alter table classes add column if not exists program_type text
  check (program_type in ('Non-board program', 'Board program', 'Board program (Medicine)'));
alter table classes add column if not exists academic_year text;
alter table classes add column if not exists semester text;
alter table classes add column if not exists course_code text;
alter table classes add column if not exists total_units text;
alter table classes add column if not exists course_type text;
alter table classes add column if not exists year_level text;
alter table classes add column if not exists campus text;
alter table classes add column if not exists college text;
alter table classes add column if not exists department text;
alter table classes add column if not exists program text;
alter table classes add column if not exists session_schedule text;

alter table teachers add column if not exists faculty_rank text;
