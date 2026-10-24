-- Class Standing as the DHVSU class record's five named, weighted criteria
-- (Info!A41:B45). The first four reuse the existing categories (quiz,
-- recitation, written, laboratory); this adds the 5th ("other") plus a
-- per-class display name for each criterion. Existing classes keep their
-- weights and tab names (an empty criteria_labels means the defaults).
-- Run this once in the SQL Editor after 0001-0037.
alter table grading_configs add column if not exists weight_other numeric not null default 0;
alter table grading_configs add column if not exists criteria_labels jsonb not null default '{}'::jsonb;
alter table grading_configs add column if not exists show_other boolean not null default true;

alter table assessments drop constraint if exists assessments_category_check;
alter table assessments add constraint assessments_category_check
  check (category in ('quiz', 'written', 'laboratory', 'recitation', 'other'));

notify pgrst, 'reload schema';
