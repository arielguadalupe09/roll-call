-- Lets teachers customize their printed Record Cards: their own school
-- branding (name, campus/department line, logo) instead of the hardcoded
-- placeholder, and per-class toggles for which sections appear.
-- Run this once in the SQL Editor after 0001-0010.

-- Teacher-level branding — the same letterhead across all of a teacher's
-- classes, edited from the Profile page.
alter table teachers add column if not exists card_school_name text;
alter table teachers add column if not exists card_campus_line text;
alter table teachers add column if not exists card_logo_path text;

-- Per-class toggles for which Record Card sections are printed, edited from
-- Gradebook > Setup. Default true so existing classes look unchanged.
alter table grading_configs add column if not exists show_assignment boolean not null default true;
alter table grading_configs add column if not exists show_recitation boolean not null default true;
alter table grading_configs add column if not exists show_quiz boolean not null default true;
alter table grading_configs add column if not exists show_written boolean not null default true;
alter table grading_configs add column if not exists show_laboratory boolean not null default true;
alter table grading_configs add column if not exists show_major_exam boolean not null default true;
alter table grading_configs add column if not exists show_attendance boolean not null default true;

-- Private storage bucket for teacher-uploaded Record Card logos.
-- Path convention: {teacher_id}/{filename}
insert into storage.buckets (id, name, public)
values ('card-logos', 'card-logos', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by default on every Supabase
-- project, and is owned by supabase_storage_admin (not postgres), so it
-- can't be altered here — only policies can be added.
drop policy if exists "teacher rw own card logo" on storage.objects;
create policy "teacher rw own card logo" on storage.objects
  for all
  using (
    bucket_id = 'card-logos'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  )
  with check (
    bucket_id = 'card-logos'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );
