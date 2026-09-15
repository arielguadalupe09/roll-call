-- Reshapes messaging from flat 1:1 (sender_id/recipient_id) into a
-- conversations + conversation_participants model, so a single message can
-- have more than one recipient (group chats). Existing 1:1 message pairs
-- are backfilled into implicit 1-on-1 conversations before recipient_id/
-- read_at are dropped. Run this once in the SQL Editor after 0001-0028.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid not null references teachers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, teacher_id)
);

alter table messages add column if not exists conversation_id uuid references conversations(id) on delete cascade;

-- Backfill: every existing (sender, recipient) pair becomes a 1:1
-- conversation, both teachers added as participants, their messages
-- re-pointed at it. Pairs are deduped regardless of who sent first.
do $$
declare
  pair record;
  new_conv_id uuid;
begin
  for pair in
    select distinct least(sender_id, recipient_id) as a, greatest(sender_id, recipient_id) as b
    from messages
    where conversation_id is null
  loop
    insert into conversations (is_group, created_by) values (false, pair.a) returning id into new_conv_id;
    insert into conversation_participants (conversation_id, teacher_id) values (new_conv_id, pair.a), (new_conv_id, pair.b);
    update messages set conversation_id = new_conv_id
      where conversation_id is null
        and least(sender_id, recipient_id) = pair.a
        and greatest(sender_id, recipient_id) = pair.b;
  end loop;
end $$;

alter table messages alter column conversation_id set not null;

-- These 0028 policies reference recipient_id -- must go before the column
-- drop below, or Postgres refuses with "other objects depend on it".
drop policy if exists "teacher reads own messages" on messages;
drop policy if exists "teacher sends messages as self" on messages;
drop policy if exists "recipient marks message read" on messages;

alter table messages drop column recipient_id;
alter table messages drop column read_at;

alter table conversations enable row level security;
alter table conversation_participants enable row level security;

drop policy if exists "participant reads conversation" on conversations;
create policy "participant reads conversation" on conversations
  for select using (
    exists (select 1 from conversation_participants cp
            where cp.conversation_id = conversations.id and cp.teacher_id = auth.uid())
  );

drop policy if exists "teacher creates conversation" on conversations;
create policy "teacher creates conversation" on conversations
  for insert with check (created_by = auth.uid());

drop policy if exists "participant reads participants" on conversation_participants;
create policy "participant reads participants" on conversation_participants
  for select using (
    exists (select 1 from conversation_participants cp2
            where cp2.conversation_id = conversation_participants.conversation_id and cp2.teacher_id = auth.uid())
  );

drop policy if exists "participant adds participants" on conversation_participants;
create policy "participant adds participants" on conversation_participants
  for insert with check (
    teacher_id = auth.uid()
    or exists (select 1 from conversation_participants cp
               where cp.conversation_id = conversation_participants.conversation_id and cp.teacher_id = auth.uid())
  );

drop policy if exists "participant updates own read state" on conversation_participants;
create policy "participant updates own read state" on conversation_participants
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "participant reads conversation messages" on messages
  for select using (
    exists (select 1 from conversation_participants cp
            where cp.conversation_id = messages.conversation_id and cp.teacher_id = auth.uid())
  );

create policy "participant sends messages" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from conversation_participants cp
                where cp.conversation_id = messages.conversation_id and cp.teacher_id = auth.uid())
  );

alter publication supabase_realtime add table conversation_participants;
