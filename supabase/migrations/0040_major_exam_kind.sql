-- A term can now have two in-person major exams: written and laboratory.
-- Both are slots of the one Major Exam criterion (the DHVSU template's
-- AM:AP block averages its slots), so with both present each counts half
-- of the Major Exam weight -- e.g. 15% + 15% of 30%. Existing exams are
-- the written one. Run this once in the SQL Editor after 0001-0039.
alter table major_exams add column if not exists kind text not null default 'written';

alter table major_exams drop constraint if exists major_exams_kind_check;
alter table major_exams add constraint major_exams_kind_check check (kind in ('written', 'laboratory'));

-- Replace the one-exam-per-term unique (class_id, period) -- whatever it's
-- named -- with one exam of each kind per term.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'major_exams'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (class_id, period)'
  loop
    execute format('alter table major_exams drop constraint %I', c);
  end loop;
end $$;

alter table major_exams drop constraint if exists major_exams_class_period_kind_key;
alter table major_exams add constraint major_exams_class_period_kind_key unique (class_id, period, kind);

notify pgrst, 'reload schema';
