-- Recitation can now be graded like Quiz / Written / Laboratory: a titled
-- item with its own max score (e.g. /100) and a score per student, entered
-- from the Gradebook's Recitation tab. Scanner recitation taps
-- (participation_logs, scored /5) still exist and still count toward the
-- same Recitation category -- see buildRecordCardData in
-- lib/record-card-data.ts.
alter table assessments drop constraint if exists assessments_category_check;
alter table assessments add constraint assessments_category_check
  check (category in ('quiz', 'written', 'laboratory', 'recitation'));
