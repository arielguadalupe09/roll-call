-- Video lectures for asynchronous learning: teachers upload/record a video
-- (or link to an externally-hosted one) per class; students watch via the
-- public /watch/[classId] page (see app/watch/[classId]/page.tsx), which
-- reads through the service-role admin client rather than a public RLS
-- policy — same pattern as the check-in flow.

create table if not exists video_lectures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  video_url text,
  storage_path text,
  published boolean not null default true,
  created_at timestamptz default now(),
  constraint video_lectures_has_source check (video_url is not null or storage_path is not null)
);

create index if not exists video_lectures_class_idx on video_lectures (class_id);

alter table video_lectures enable row level security;

drop policy if exists "teacher manages own video_lectures" on video_lectures;
create policy "teacher manages own video_lectures" on video_lectures
  for all using (class_id in (select id from classes where teacher_id = auth.uid()))
  with check (class_id in (select id from classes where teacher_id = auth.uid()));

-- Private bucket for teacher-uploaded/recorded lecture videos.
-- Path convention: {class_id}/{random uuid}.{ext} — see lib/video-lecture-path.ts.
insert into storage.buckets (id, name, public)
values ('lecture-videos', 'lecture-videos', false)
on conflict (id) do nothing;

drop policy if exists "teacher rw own lecture videos" on storage.objects;
create policy "teacher rw own lecture videos" on storage.objects
  for all
  using (
    bucket_id = 'lecture-videos'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    bucket_id = 'lecture-videos'
    and (storage.foldername(name))[1]::uuid in (select id from classes where teacher_id = auth.uid())
  );
