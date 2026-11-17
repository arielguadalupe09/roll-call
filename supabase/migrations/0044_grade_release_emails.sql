-- Email notice when a teacher releases a term's grades (adapted from the
-- Queen of Smiles booking emails). students.email is optional: the teacher
-- can type it in the class's Students list, or the student adds it
-- themselves in the /student portal. Every email sent (or, without SMTP
-- configured, only logged) is recorded in grade_notifications so a release
-- never emails the same student twice and the teacher can see who got one.
-- Run this once in the SQL Editor after 0001-0043.
alter table students add column if not exists email text;

create table if not exists grade_notifications (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references grade_releases(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  recipient text not null,
  subject text not null,
  -- 'sent' (delivered over SMTP), 'logged' (no SMTP configured, printed to
  -- the server log only) or 'failed' (SMTP error; retried on the next send).
  status text not null check (status in ('sent', 'logged', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (release_id, student_id)
);

alter table grade_notifications enable row level security;

drop policy if exists "teacher manages own grade notifications" on grade_notifications;
create policy "teacher manages own grade notifications" on grade_notifications
  for all using (
    release_id in (
      select id from grade_releases where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    release_id in (
      select id from grade_releases where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
