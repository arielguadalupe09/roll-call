-- Announcements, materials, assignments, and per-student submissions/grades.
-- Same teacher-owns-via-class RLS pattern as 0001_init.sql.
-- Run this once in the SQL Editor after 0001_init.sql.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  url text not null,
  created_at timestamptz default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  max_score numeric not null default 100,
  created_at timestamptz default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null default 'missing' check (status in ('missing', 'submitted', 'graded')),
  file_path text,
  file_name text,
  score numeric,
  feedback text,
  updated_at timestamptz default now(),
  unique (assignment_id, student_id)
);

create index if not exists announcements_class_idx on announcements (class_id);
create index if not exists materials_class_idx on materials (class_id);
create index if not exists assignments_class_idx on assignments (class_id);
create index if not exists submissions_assignment_idx on submissions (assignment_id);

alter table announcements enable row level security;
alter table materials enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;

drop policy if exists "teacher manages own announcements" on announcements;
create policy "teacher manages own announcements" on announcements
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own materials" on materials;
create policy "teacher manages own materials" on materials
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own assignments" on assignments;
create policy "teacher manages own assignments" on assignments
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own submissions" on submissions;
create policy "teacher manages own submissions" on submissions
  for all using (
    assignment_id in (
      select id from assignments where class_id in (select id from classes where teacher_id = auth.uid())
    )
  )
  with check (
    assignment_id in (
      select id from assignments where class_id in (select id from classes where teacher_id = auth.uid())
    )
  );

-- Private storage bucket for teacher-attached submission files.
-- Path convention: {class_id}/{assignment_id}/{student_id}/{filename}
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by default on every Supabase
-- project, and is owned by supabase_storage_admin (not postgres), so it
-- can't be altered here — only policies can be added.

drop policy if exists "teacher rw own submission files" on storage.objects;
create policy "teacher rw own submission files" on storage.objects
  for all
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  );
