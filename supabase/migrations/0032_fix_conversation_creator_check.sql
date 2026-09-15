-- Fixes: conversation_participants insert still 403s when adding the
-- *other* members of a brand-new conversation, even after 0030/0031.
-- The "participant adds participants" policy's third branch does
-- `exists (select ... from conversations where created_by = auth.uid())`
-- -- but that nested select is itself subject to conversations' own SELECT
-- policy ("participant reads conversation"), which requires the reader to
-- already be a participant. At the exact moment we're inserting the other
-- members, the creator isn't a participant yet either (that's this same
-- insert), so the nested check can never see the conversation row, even
-- though created_by really does match. Same fix shape as 0031: a
-- security-definer helper bypasses conversations' RLS for this internal
-- lookup. Run once in the SQL Editor after 0001-0031.

create or replace function is_conversation_creator(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversations
    where id = target_conversation_id and created_by = auth.uid()
  );
$$;

drop policy if exists "participant adds participants" on conversation_participants;
create policy "participant adds participants" on conversation_participants
  for insert with check (
    teacher_id = auth.uid()
    or is_conversation_participant(conversation_id)
    or is_conversation_creator(conversation_id)
  );
