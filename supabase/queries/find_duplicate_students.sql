-- Read-only audit: run in the Supabase SQL Editor. Changes nothing.
-- Lists students enrolled more than once in the same class under the same
-- name (case/spacing/punctuation-insensitive), which the schema doesn't
-- prevent because only students.code is unique.

select
  c.name as class_name,
  lower(regexp_replace(s.name, '[^a-zA-Z]', '', 'g')) as normalized_name,
  count(*) as copies,
  array_agg(s.name order by s.created_at) as names,
  array_agg(s.code order by s.created_at) as codes,
  array_agg(s.id order by s.created_at) as student_ids
from students s
join classes c on c.id = s.class_id
group by c.id, c.name, lower(regexp_replace(s.name, '[^a-zA-Z]', '', 'g'))
having count(*) > 1
order by c.name, normalized_name;
