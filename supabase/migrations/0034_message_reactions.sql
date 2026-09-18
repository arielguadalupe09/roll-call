-- Messenger/Instagram-style reactions on individual messages. One reaction
-- per teacher per message (picking a new emoji replaces the old one) --
-- enforced by the unique(message_id, teacher_id) constraint, which also
-- lets the client upsert instead of juggling delete-then-insert. Run this
-- once in the SQL Editor after 0001-0033.

create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, teacher_id)
);

create index if not exists message_reactions_message_idx on message_reactions (message_id);

alter table message_reactions enable row level security;

drop policy if exists "participant reads message reactions" on message_reactions;
create policy "participant reads message reactions" on message_reactions
  for select using (
    exists (
      select 1 from messages m
      join conversation_participants cp on cp.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cp.teacher_id = auth.uid()
    )
  );

drop policy if exists "participant reacts to message" on message_reactions;
create policy "participant reacts to message" on message_reactions
  for insert with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from messages m
      join conversation_participants cp on cp.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cp.teacher_id = auth.uid()
    )
  );

drop policy if exists "participant updates own reaction" on message_reactions;
create policy "participant updates own reaction" on message_reactions
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "participant removes own reaction" on message_reactions;
create policy "participant removes own reaction" on message_reactions
  for delete using (teacher_id = auth.uid());

alter publication supabase_realtime add table message_reactions;
