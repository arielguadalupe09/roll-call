-- Teacher-to-teacher direct messages, backing the Messages module.
-- Flat table (no separate "conversations" row) -- a thread is just every
-- message between two teacher ids, derived client-side. Run this once in
-- the SQL Editor after 0001-0027.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references teachers(id) on delete cascade,
  recipient_id uuid not null references teachers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists messages_recipient_idx on messages (recipient_id, created_at desc);
create index if not exists messages_sender_idx on messages (sender_id, created_at desc);

alter table messages enable row level security;

drop policy if exists "teacher reads own messages" on messages;
create policy "teacher reads own messages" on messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "teacher sends messages as self" on messages;
create policy "teacher sends messages as self" on messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists "recipient marks message read" on messages;
create policy "recipient marks message read" on messages
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- Live delivery for the message thread + conversation list.
alter publication supabase_realtime add table messages;
