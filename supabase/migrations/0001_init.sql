-- Roll Call schema, RLS, realtime, and teacher-auto-provisioning trigger.
-- Run this once against the project's database (SQL Editor -> New query -> Run).

create extension if not exists pgcrypto;

create table if not exists teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  code text not null unique,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  date date not null,
  token text not null unique,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  date date not null,
  method text not null check (method in ('scan', 'self')),
  recorded_at timestamptz default now(),
  unique (class_id, student_id, date)
);

create index if not exists students_code_idx on students (code);
create index if not exists attendance_class_date_idx on attendance (class_id, date);
create index if not exists sessions_token_idx on sessions (token);

-- Auto-create a teachers row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.teachers (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table teachers enable row level security;
alter table classes enable row level security;
alter table students enable row level security;
alter table sessions enable row level security;
alter table attendance enable row level security;

drop policy if exists "teacher reads own row" on teachers;
create policy "teacher reads own row" on teachers
  for select using (id = auth.uid());

drop policy if exists "teacher manages own classes" on classes;
create policy "teacher manages own classes" on classes
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "teacher manages own students" on students;
create policy "teacher manages own students" on students
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own sessions" on sessions;
create policy "teacher manages own sessions" on sessions
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists "teacher manages own attendance" on attendance;
create policy "teacher manages own attendance" on attendance
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

-- Realtime for live attendance counts / records updates.
alter publication supabase_realtime add table attendance;
