-- Fixes: creating a new conversation (1:1 or group) failed silently.
-- The 0029 "participant adds participants" policy let a row in only if
-- the inserter already had a participant row in that conversation -- but
-- messages-client.tsx inserts every member (including the creator) in one
-- batched INSERT, and within a single multi-row INSERT, earlier rows in
-- the same statement aren't visible yet to a policy check on later rows.
-- So the creator's own row (inserted in the same batch) never satisfied
-- the EXISTS check for the other members' rows. Add a second, order-
-- independent path: the conversation's creator (conversations.created_by,
-- already committed by the prior, separate INSERT into conversations) can
-- add participants regardless of insert batching. Run once in the SQL
-- Editor after 0001-0029.

drop policy if exists "participant adds participants" on conversation_participants;
create policy "participant adds participants" on conversation_participants
  for insert with check (
    teacher_id = auth.uid()
    or exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = conversation_participants.conversation_id and cp.teacher_id = auth.uid()
    )
    or exists (
      select 1 from conversations c
      where c.id = conversation_participants.conversation_id and c.created_by = auth.uid()
    )
  );
