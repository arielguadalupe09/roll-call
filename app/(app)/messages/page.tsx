import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Conversation, ConversationParticipant, Message, TeacherOption } from "@/lib/types";
import MessagesClient from "./messages-client";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) redirect("/login");

  const { data: myParticipation } = await supabase
    .from("conversation_participants")
    .select("*")
    .eq("teacher_id", user.id);

  const conversationIds = ((myParticipation as ConversationParticipant[] | null) ?? []).map(
    (r) => r.conversation_id,
  );

  const [{ data: conversations }, { data: participants }, { data: messages }] = conversationIds.length
    ? await Promise.all([
        supabase.from("conversations").select("*").in("id", conversationIds),
        supabase.from("conversation_participants").select("*").in("conversation_id", conversationIds),
        supabase
          .from("messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true }),
      ])
    : [
        { data: [] as Conversation[] },
        { data: [] as ConversationParticipant[] },
        { data: [] as Message[] },
      ];

  // Teachers can only read their own row under RLS -- resolving names/
  // emails for the roster (both existing conversation partners and the
  // "New Message" picker) needs the service-role client, same pattern as
  // the Schedule page's teacher picker.
  const admin = createAdminClient();
  const { data: roster } = await admin
    .from("teachers")
    .select("id, full_name, email")
    .neq("id", user.id)
    .order("full_name", { ascending: true });

  return (
    <MessagesClient
      teacherId={user.id}
      initialConversations={(conversations as Conversation[] | null) ?? []}
      initialParticipants={(participants as ConversationParticipant[] | null) ?? []}
      initialMessages={(messages as Message[] | null) ?? []}
      roster={(roster as TeacherOption[] | null) ?? []}
    />
  );
}
