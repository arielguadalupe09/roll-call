-- Fixes: "infinite recursion detected in policy for relation
-- conversation_participants". The 0029/0030 policies on
-- conversation_participants check membership via a subquery against
-- conversation_participants itself -- evaluating that subquery re-invokes
-- the table's own RLS policy, which queries itself again, forever.
-- Standard fix (same pattern as the security-definer functions in
-- 0001_init.sql / 0019_multi_class_assignments.sql): a security-definer
-- helper function bypasses RLS for its internal lookup, so calling it from
-- a policy doesn't recurse. Run once in the SQL Editor after 0001-0030.

create or replace function is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = target_conversation_id and teacher_id = auth.uid()
  );
$$;

drop policy if exists "participant reads participants" on conversation_participants;
create policy "participant reads participants" on conversation_participants
  for select using (is_conversation_participant(conversation_id));

drop policy if exists "participant adds participants" on conversation_participants;
create policy "participant adds participants" on conversation_participants
  for insert with check (
    teacher_id = auth.uid()
    or is_conversation_participant(conversation_id)
    or exists (
      select 1 from conversations c
      where c.id = conversation_participants.conversation_id and c.created_by = auth.uid()
    )
  );
