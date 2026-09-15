"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, ConversationParticipant, Message, TeacherOption } from "@/lib/types";
import { Input } from "@/app/_components/input";
import Button from "@/app/_components/button";
import { useToast } from "@/app/_components/toast";

const EMOJIS = [
  "😀", "😂", "😊", "😍", "🙌", "👍", "👏", "🙏",
  "🎉", "✅", "❌", "❓", "💯", "🔥", "📚", "📝",
  "🕒", "📌", "⚠️", "💡", "😅", "😢", "😴", "🤔",
  "👋", "🎓", "📅", "✨", "🚀", "❤️", "😎", "🤝",
];

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateDivider(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function groupByDate(msgs: Message[]): [string, Message[]][] {
  const map = new Map<string, Message[]>();
  for (const m of msgs) {
    const label = formatDateDivider(m.created_at);
    const list = map.get(label) ?? [];
    list.push(m);
    map.set(label, list);
  }
  return Array.from(map.entries());
}

export default function MessagesClient({
  teacherId,
  initialConversations,
  initialParticipants,
  initialMessages,
  roster,
}: {
  teacherId: string;
  initialConversations: Conversation[];
  initialParticipants: ConversationParticipant[];
  initialMessages: Message[];
  roster: TeacherOption[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [participants, setParticipants] = useState(initialParticipants);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const { showToast } = useToast();

  const pickerRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const rosterById = useMemo(() => new Map(roster.map((t) => [t.id, t])), [roster]);

  const participantsByConversation = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of participants) {
      const list = map.get(p.conversation_id) ?? [];
      list.push(p.teacher_id);
      map.set(p.conversation_id, list);
    }
    return map;
  }, [participants]);

  const myLastReadByConversation = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of participants) {
      if (p.teacher_id === teacherId) map.set(p.conversation_id, p.last_read_at);
    }
    return map;
  }, [participants, teacherId]);

  // Resolved display name + (for groups) a "who's in it" subtitle, per
  // conversation -- computed once here so the list, header, and bubbles
  // all read from the same source instead of re-deriving it per call site.
  const conversationMeta = useMemo(() => {
    const map = new Map<string, { name: string; subtitle: string | null }>();
    for (const c of conversations) {
      const ids = participantsByConversation.get(c.id) ?? [];
      if (c.is_group) {
        const others = ids
          .filter((id) => id !== teacherId)
          .map((id) => rosterById.get(id)?.full_name ?? rosterById.get(id)?.email ?? "Unknown");
        map.set(c.id, { name: c.name ?? "Group chat", subtitle: others.join(", ") });
      } else {
        const otherId = ids.find((id) => id !== teacherId);
        const other = otherId ? rosterById.get(otherId) : null;
        map.set(c.id, { name: other?.full_name ?? other?.email ?? "Unknown teacher", subtitle: null });
      }
    }
    return map;
  }, [conversations, participantsByConversation, rosterById, teacherId]);

  const messagesByConversation = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages) {
      const list = map.get(m.conversation_id) ?? [];
      list.push(m);
      map.set(m.conversation_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [messages]);

  const conversationRows = useMemo(() => {
    return conversations
      .map((c) => {
        const list = messagesByConversation.get(c.id) ?? [];
        const last = list[list.length - 1] ?? null;
        const lastReadAt = myLastReadByConversation.get(c.id) ?? null;
        const unreadCount = list.filter(
          (m) => m.sender_id !== teacherId && (!lastReadAt || m.created_at > lastReadAt),
        ).length;
        return { conversation: c, last, unreadCount };
      })
      .sort((a, b) => {
        const at = a.last?.created_at ?? a.conversation.created_at;
        const bt = b.last?.created_at ?? b.conversation.created_at;
        return bt.localeCompare(at);
      });
  }, [conversations, messagesByConversation, myLastReadByConversation, teacherId]);

  const filteredConversationRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversationRows;
    return conversationRows.filter((row) =>
      (conversationMeta.get(row.conversation.id)?.name ?? "").toLowerCase().includes(q),
    );
  }, [conversationRows, search, conversationMeta]);

  const filteredRoster = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((t) => (t.full_name ?? t.email).toLowerCase().includes(q));
  }, [roster, pickerSearch]);

  const threadMessages = selectedConversationId ? messagesByConversation.get(selectedConversationId) ?? [] : [];
  const selectedMeta = selectedConversationId ? conversationMeta.get(selectedConversationId) ?? null : null;

  const refreshAll = useCallback(async () => {
    const supabase = createClient();
    const { data: myRows } = await supabase
      .from("conversation_participants")
      .select("*")
      .eq("teacher_id", teacherId);
    const ids = ((myRows as ConversationParticipant[] | null) ?? []).map((r) => r.conversation_id);

    if (ids.length === 0) {
      setConversations([]);
      setParticipants([]);
      setMessages([]);
      return;
    }

    const [{ data: convs }, { data: allParticipants }, { data: msgs }] = await Promise.all([
      supabase.from("conversations").select("*").in("id", ids),
      supabase.from("conversation_participants").select("*").in("conversation_id", ids),
      supabase.from("messages").select("*").in("conversation_id", ids).order("created_at", { ascending: true }),
    ]);
    if (convs) setConversations(convs as Conversation[]);
    if (allParticipants) setParticipants(allParticipants as ConversationParticipant[]);
    if (msgs) setMessages(msgs as Message[]);
  }, [teacherId]);

  useEffect(() => {
    const supabase = createClient();
    // Unfiltered on purpose: Realtime evaluates the subscriber's own RLS
    // select policy per row, so this only ever delivers INSERTs for
    // conversations I'm a participant of -- a group has no single "me"
    // column to filter on the way a 1:1 recipient_id could.
    const channel = supabase
      .channel(`messages-inbox-${teacherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    // Backstop (also picks up a brand-new conversation I've just been
    // added to, within the poll interval) in case Realtime doesn't
    // deliver -- same pattern as the check-in session's live feed.
    const poll = setInterval(refreshAll, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshAll);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshAll);
    };
  }, [teacherId, refreshAll]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(target)) setPickerOpen(false);
      if (emojiRef.current && !emojiRef.current.contains(target)) setEmojiOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [threadMessages.length, selectedConversationId]);

  async function openConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setPickerOpen(false);

    const now = new Date().toISOString();
    setParticipants((prev) =>
      prev.map((p) =>
        p.conversation_id === conversationId && p.teacher_id === teacherId ? { ...p, last_read_at: now } : p,
      ),
    );
    const supabase = createClient();
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("teacher_id", teacherId);
  }

  function toggleRecipient(id: string) {
    setSelectedRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerSearch("");
    setSelectedRecipientIds(new Set());
    setGroupName("");
  }

  async function startConversation() {
    if (selectedRecipientIds.size === 0 || creating) return;
    const isGroup = selectedRecipientIds.size >= 2;
    if (isGroup && !groupName.trim()) return;

    if (!isGroup) {
      const otherId = Array.from(selectedRecipientIds)[0];
      const existing = conversations.find((c) => {
        if (c.is_group) return false;
        const ids = participantsByConversation.get(c.id) ?? [];
        return ids.length === 2 && ids.includes(otherId) && ids.includes(teacherId);
      });
      if (existing) {
        closePicker();
        openConversation(existing.id);
        return;
      }
    }

    setCreating(true);
    const supabase = createClient();

    // Generating the id client-side (and skipping .select() on both
    // inserts below) sidesteps an RLS ordering problem: .insert().select()
    // asks Postgres to read the row back via RETURNING, which is governed
    // by the table's SELECT policy -- but right after inserting the
    // conversation, I'm not a participant of it yet (that's the next
    // insert), so the read-back fails even though the insert itself is
    // fine. I already know every field I'm writing, so there's no need to
    // round-trip for them.
    const conversationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const name = isGroup ? groupName.trim() : null;

    const { error: convError } = await supabase.from("conversations").insert({
      id: conversationId,
      is_group: isGroup,
      name,
      created_by: teacherId,
    });

    if (convError) {
      setCreating(false);
      showToast(convError.message);
      return;
    }

    const memberIds = [teacherId, ...Array.from(selectedRecipientIds)];
    const { error: participantsError } = await supabase
      .from("conversation_participants")
      .insert(memberIds.map((id) => ({ conversation_id: conversationId, teacher_id: id })));

    setCreating(false);
    if (participantsError) {
      showToast(participantsError.message);
      return;
    }

    setConversations((prev) => [
      ...prev,
      { id: conversationId, is_group: isGroup, name, created_by: teacherId, created_at: nowIso },
    ]);
    setParticipants((prev) => [
      ...prev,
      ...memberIds.map((id) => ({
        conversation_id: conversationId,
        teacher_id: id,
        last_read_at: null,
        created_at: nowIso,
      })),
    ]);
    closePicker();
    setSelectedConversationId(conversationId);
  }

  async function sendMessage() {
    const body = composer.trim();
    if (!body || !selectedConversationId || sending) return;
    setSending(true);
    setComposer("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: selectedConversationId, sender_id: teacherId, body })
      .select()
      .single();
    setSending(false);
    if (error || !data) {
      setComposer(body);
      showToast(error?.message ?? "Couldn't send that message. Try again.");
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === (data as Message).id) ? prev : [...prev, data as Message]));
  }

  function insertEmoji(emoji: string) {
    setComposer((prev) => prev + emoji);
    composerRef.current?.focus();
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Messages</h1>
          <p className="mt-1 text-ink/70">Communicate with fellow teachers.</p>
        </div>
        <div ref={pickerRef} className="relative shrink-0">
          <Button variant="highlight" onClick={() => setPickerOpen((v) => !v)}>
            + New Message
          </Button>
          {pickerOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl bg-card p-3 shadow-lg">
              <Input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Find teachers..."
                autoFocus
              />
              <div className="mt-2 max-h-64 overflow-y-auto">
                {filteredRoster.map((t) => {
                  const checked = selectedRecipientIds.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleRecipient(t.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                        checked ? "bg-slate-light" : "hover:bg-slate-light/60"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ? "border-navy bg-navy text-card" : "border-line"
                        }`}
                      >
                        {checked && "✓"}
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-semibold text-navy">
                        {initials(t.full_name ?? t.email)}
                      </span>
                      <span className="min-w-0 truncate text-ink">{t.full_name ?? t.email}</span>
                    </button>
                  );
                })}
                {filteredRoster.length === 0 && (
                  <p className="px-2 py-2 text-sm text-muted">No other teachers found.</p>
                )}
              </div>

              {selectedRecipientIds.size >= 2 && (
                <Input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Name this group..."
                  className="mt-2"
                />
              )}

              <Button
                className="mt-2 w-full"
                disabled={
                  selectedRecipientIds.size === 0 || (selectedRecipientIds.size >= 2 && !groupName.trim()) || creating
                }
                onClick={startConversation}
              >
                {creating ? "Starting..." : selectedRecipientIds.size >= 2 ? "Create group" : "Start chat"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        className="mx-auto mt-6 grid max-w-6xl grid-cols-1 overflow-hidden rounded-xl bg-card md:grid-cols-[300px_1fr]"
        style={{ height: "min(75vh, 640px)" }}
      >
        <div className="flex min-h-0 flex-col border-b border-line md:border-b-0 md:border-r">
          <div className="p-3">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages..."
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredConversationRows.map(({ conversation, last, unreadCount }) => {
              const meta = conversationMeta.get(conversation.id);
              const name = meta?.name ?? "Unknown";
              const outgoingLast = last?.sender_id === teacherId;
              const active = conversation.id === selectedConversationId;
              const unread = unreadCount > 0;
              return (
                <button
                  key={conversation.id}
                  onClick={() => openConversation(conversation.id)}
                  className={`flex w-full items-start gap-2.5 border-l-[3px] px-3 py-2.5 text-left transition ${
                    active ? "border-gold bg-slate-light/60" : "border-transparent hover:bg-slate-light/40"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-semibold text-navy">
                    {initials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm first-letter:capitalize ${unread ? "font-semibold text-ink" : "font-medium text-ink"}`}
                      >
                        {name}
                      </span>
                      {last && (
                        <span className="shrink-0 text-[11px] text-muted">{formatTime(last.created_at)}</span>
                      )}
                    </span>
                    <span className={`block truncate text-xs ${unread ? "font-medium text-ink" : "text-muted"}`}>
                      {last ? `${outgoingLast ? "You: " : ""}${last.body}` : "No messages yet"}
                    </span>
                  </span>
                </button>
              );
            })}
            {filteredConversationRows.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">No conversations yet.</p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {!selectedConversationId || !selectedMeta ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
              Select a conversation, or start a new one.
            </div>
          ) : (
            <>
              <div className="border-b border-line px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/10 text-xs font-semibold text-navy">
                    {initials(selectedMeta.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink first-letter:capitalize">{selectedMeta.name}</p>
                    {selectedMeta.subtitle && (
                      <p className="truncate text-xs text-muted first-letter:capitalize">{selectedMeta.subtitle}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {threadMessages.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">No messages yet — say hello.</p>
                )}
                {groupByDate(threadMessages).map(([dateLabel, dayMessages]) => (
                  <div key={dateLabel}>
                    <div className="my-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-line" />
                      <span className="shrink-0 text-xs text-muted">{dateLabel}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    {dayMessages.map((m) => {
                      const outgoing = m.sender_id === teacherId;
                      const sender = rosterById.get(m.sender_id);
                      const senderName = outgoing ? "You" : sender?.full_name ?? sender?.email ?? "Unknown";
                      return (
                        <div key={m.id} className={`mb-3 flex flex-col ${outgoing ? "items-end" : "items-start"}`}>
                          <span
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                              outgoing ? "bg-navy text-card" : "border border-line bg-card text-ink"
                            }`}
                          >
                            {m.body}
                          </span>
                          <span className="mt-1 text-[11px] text-muted">
                            {senderName} · {formatTime(m.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              <div className="flex items-center gap-2 border-t border-line p-3">
                <div ref={emojiRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    aria-label="Insert emoji"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-slate-light"
                  >
                    🙂
                  </button>
                  {emojiOpen && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl bg-card p-2 shadow-lg">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => insertEmoji(e)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-slate-light"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  ref={composerRef}
                  type="text"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Write message here..."
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={!composer.trim() || sending}>
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
