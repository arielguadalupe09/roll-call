-- Term grades are hidden in the student portal until the teacher releases
-- them (gradebook Overview -> "Release Midterm grades"). Releasing shows each
-- student a one-time "New" notice with their grade; grade_release_views
-- records who has seen it. Written only by the student profile route via the
-- service-role client, so it has no student-facing policy.
-- Run this once in the SQL Editor after 0001-0041.
create table if not exists grade_releases (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  period text not null check (period in ('prelim', 'midterm', 'finals')),
  released_at timestamptz not null default now(),
  unique (class_id, period)
);

alter table grade_releases enable row level security;

drop policy if exists "teacher manages own grade releases" on grade_releases;
create policy "teacher manages own grade releases" on grade_releases
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

create table if not exists grade_release_views (
  release_id uuid not null references grade_releases(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (release_id, student_id)
);

alter table grade_release_views enable row level security;

drop policy if exists "teacher reads own grade release views" on grade_release_views;
create policy "teacher reads own grade release views" on grade_release_views
  for select using (
    release_id in (
      select id from grade_releases where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
