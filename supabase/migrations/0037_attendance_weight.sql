-- Attendance replaces Assignments as a graded category (matching the DHVSU
-- class record's Attendance criterion, Info!B38). Assignments stay as a
-- feature (posting work, student submissions) but no longer count toward
-- any grade, so each class's assignment weight moves to attendance.
-- Safe to re-run: once weight_assignment is 0 nothing moves again.
-- Run this once in the SQL Editor after 0001-0036.
alter table grading_configs add column if not exists weight_attendance numeric not null default 0;

update grading_configs
set weight_attendance = weight_attendance + weight_assignment,
    weight_assignment = 0
where weight_assignment <> 0;

notify pgrst, 'reload schema';
