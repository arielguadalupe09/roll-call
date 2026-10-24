-- SUPERSEDED (2026-10-24): scanned recitation was then removed entirely --
-- the scanner no longer has a Recitation mode, and the items/taps this
-- created were deleted. scan_date is left in place, unused. Re-running this
-- is harmless (there are no recitation taps left to backfill).
-- Scanner recitation taps now land in the gradebook's Recitation criterion:
-- each class day with taps is one recitation item (max 5), and a student's
-- score on it is the average of their taps that day. scan_date ties the
-- item to its day so later scans that day update the same item
-- (lib/recitation-sync.ts). The taps themselves stay in participation_logs.
-- Run this once in the SQL Editor after 0001-0038. Safe to re-run.
alter table assessments add column if not exists scan_date date;

create unique index if not exists assessments_scan_date_uniq
  on assessments (class_id, scan_date)
  where category = 'recitation' and scan_date is not null;

-- Backfill: one item per class-day of existing taps. Term follows the
-- class's cutoff dates, same rule as lib/record-card-data.ts periodForDate.
insert into assessments (class_id, category, title, date, max_score, period, scan_date)
select
  d.class_id,
  'recitation',
  'Recitation – ' || to_char(d.date, 'YYYY-MM-DD'),
  d.date,
  5,
  case
    when coalesce(g.use_prelims, false) and g.prelim_end_date is not null and d.date <= g.prelim_end_date then 'prelim'
    when g.midterm_end_date is null then case when coalesce(g.use_prelims, false) then 'prelim' else 'midterm' end
    when d.date <= g.midterm_end_date then 'midterm'
    else 'finals'
  end,
  d.date
from (
  select distinct class_id, date
  from participation_logs
  where type = 'recitation' and score is not null
) d
left join grading_configs g on g.class_id = d.class_id
on conflict (class_id, scan_date) where category = 'recitation' and scan_date is not null do nothing;

insert into assessment_scores (assessment_id, student_id, score, updated_at)
select a.id, l.student_id, round(avg(l.score)::numeric, 2), now()
from participation_logs l
join assessments a
  on a.class_id = l.class_id and a.category = 'recitation' and a.scan_date = l.date
where l.type = 'recitation' and l.score is not null
group by a.id, l.student_id
on conflict (assessment_id, student_id) do update set score = excluded.score, updated_at = now();

notify pgrst, 'reload schema';
