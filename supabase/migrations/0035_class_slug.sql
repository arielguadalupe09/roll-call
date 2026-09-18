-- Adds a human-readable, stable slug to classes (e.g. "algebra-101"), used
-- in place of the raw uuid in every teacher-facing class URL. Unique per
-- teacher only (not globally) -- RLS already scopes all teacher-facing
-- lookups to auth.uid(), so a same-named class in another teacher's account
-- never collides. Generated once at insert and never changed on rename, so
-- existing links/bookmarks keep working.

alter table classes add column if not exists slug text;

create or replace function slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function set_class_slug()
returns trigger
language plpgsql
as $$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  base_slug := slugify(new.name);
  if base_slug = '' then
    base_slug := 'class';
  end if;

  candidate := base_slug;
  while exists (
    select 1 from classes
    where teacher_id = new.teacher_id
      and slug = candidate
      and id is distinct from new.id
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists trg_set_class_slug on classes;
create trigger trg_set_class_slug
  before insert on classes
  for each row
  execute function set_class_slug();

-- Backfill existing rows, oldest first, so creation order (not name) decides
-- who keeps the bare slug vs. who gets the -2/-3 suffix on a name collision.
do $$
declare
  r record;
  base_slug text;
  candidate text;
  suffix int;
begin
  for r in select id, teacher_id, name from classes where slug is null order by created_at asc loop
    base_slug := slugify(r.name);
    if base_slug = '' then
      base_slug := 'class';
    end if;
    candidate := base_slug;
    suffix := 1;
    while exists (
      select 1 from classes
      where teacher_id = r.teacher_id
        and slug = candidate
        and id <> r.id
    ) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    update classes set slug = candidate where id = r.id;
  end loop;
end $$;

alter table classes alter column slug set not null;
create unique index if not exists classes_teacher_id_slug_key on classes (teacher_id, slug);
