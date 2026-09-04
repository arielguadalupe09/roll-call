-- Lets one assignment be linked to multiple classes/sections, with a
-- hand-picked pool of students (not necessarily "everyone in the class").
-- Ownership moves from assignments.class_id to assignments.teacher_id
-- (direct), and class membership moves to a join table. "Who this
-- assignment applies to" is now just: whichever students have a
-- submissions row for it (submissions become eagerly-inserted placeholders
-- at creation time instead of lazily synthesized in the UI).

alter table assignments add column if not exists teacher_id uuid references teachers(id) on delete cascade;

update assignments a
set teacher_id = c.teacher_id
from classes c
where a.class_id = c.id
  and a.teacher_id is null;

alter table assignments alter column teacher_id set not null;

create table if not exists assignment_classes (
  assignment_id uuid not null references assignments(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  primary key (assignment_id, class_id)
);

create index if not exists assignment_classes_class_idx on assignment_classes (class_id);

-- Backfill: every existing assignment linked to its original single class.
insert into assignment_classes (assignment_id, class_id)
select id, class_id from assignments
where class_id is not null
on conflict (assignment_id, class_id) do nothing;

-- Backfill: a "missing" submission placeholder for every student who was
-- implicitly in scope under the old model, so nothing existing loses
-- roster rows now that submissions are the source of truth for "who this
-- applies to."
insert into submissions (assignment_id, student_id, status)
select a.id, s.id, 'missing'
from assignments a
join students s on s.class_id = a.class_id
where a.class_id is not null
on conflict (assignment_id, student_id) do nothing;

-- These old policies must be dropped BEFORE class_id can be dropped — both
-- reference it (assignments' own policy directly, submissions' policy via
-- a nested subquery through assignments.class_id).
drop policy if exists "teacher manages own assignments" on assignments;
drop policy if exists "teacher manages own submissions" on submissions;

alter table assignments drop column class_id;
create index if not exists assignments_teacher_idx on assignments (teacher_id);

create policy "teacher manages own assignments" on assignments
  for all using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

alter table assignment_classes enable row level security;
drop policy if exists "teacher manages own assignment_classes" on assignment_classes;
create policy "teacher manages own assignment_classes" on assignment_classes
  for all
  using (assignment_id in (select id from assignments where teacher_id = auth.uid()))
  with check (
    assignment_id in (select id from assignments where teacher_id = auth.uid())
    and class_id in (select id from classes where teacher_id = auth.uid())
  );

-- Simplifies: assignment ownership is now a direct column, no more nesting
-- through classes.
create policy "teacher manages own submissions" on submissions
  for all using (assignment_id in (select id from assignments where teacher_id = auth.uid()))
  with check (assignment_id in (select id from assignments where teacher_id = auth.uid()));

-- Storage: path convention moves from {class_id}/... to {teacher_id}/...
-- (one assignment can no longer resolve to a single class_id) — same
-- pattern as the card-logos bucket. No existing files to migrate.
drop policy if exists "teacher rw own submission files" on storage.objects;
create policy "teacher rw own submission files" on storage.objects
  for all
  using (bucket_id = 'submissions' and (storage.foldername(name))[1]::uuid = auth.uid())
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1]::uuid = auth.uid());

-- Atomic create: assignment + class links + placeholder submissions in one
-- transaction, so a partial failure can't leave an invisible orphan row.
create or replace function create_assignment_with_links(
  p_teacher_id uuid,
  p_title text,
  p_description text,
  p_due_date date,
  p_max_score numeric,
  p_period text,
  p_class_ids uuid[],
  p_student_ids uuid[]
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments;
begin
  if p_teacher_id <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if exists (
    select 1 from unnest(p_class_ids) cid
    where cid not in (select id from classes where teacher_id = auth.uid())
  ) then
    raise exception 'not authorized: class not owned by teacher';
  end if;

  insert into assignments (teacher_id, title, description, due_date, max_score, period)
  values (p_teacher_id, p_title, p_description, p_due_date, p_max_score, p_period)
  returning * into v_assignment;

  insert into assignment_classes (assignment_id, class_id)
  select v_assignment.id, cid from unnest(p_class_ids) cid;

  insert into submissions (assignment_id, student_id, status)
  select v_assignment.id, sid, 'missing' from unnest(p_student_ids) sid
  on conflict (assignment_id, student_id) do nothing;

  return v_assignment;
end;
$$;

grant execute on function create_assignment_with_links(uuid, text, text, date, numeric, text, uuid[], uuid[]) to authenticated;

-- Atomic unlink: detach one class (and its students' submissions for this
-- assignment); if that was the last linked class, delete the assignment
-- entirely (cascades any remaining submissions via FK).
create or replace function unlink_assignment_class(
  p_assignment_id uuid,
  p_class_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from assignments where id = p_assignment_id and teacher_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  delete from submissions
  where assignment_id = p_assignment_id
    and student_id in (select id from students where class_id = p_class_id);

  delete from assignment_classes
  where assignment_id = p_assignment_id and class_id = p_class_id;

  if not exists (select 1 from assignment_classes where assignment_id = p_assignment_id) then
    delete from assignments where id = p_assignment_id;
  end if;
end;
$$;

grant execute on function unlink_assignment_class(uuid, uuid) to authenticated;
