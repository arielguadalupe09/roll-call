"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import { computeClassStats } from "@/lib/dashboard-insights";
import { formatAnalyticsAnswer } from "@/lib/jarvis-analytics";
import {
  parseVoiceCommand,
  resolveClassChoice,
  type AnalyticsQuestion,
  type ClassOption,
  type VoiceCommand,
} from "@/lib/voice-commands";
import { describeClassAliases, forgetClassAliases, getClassAliases, rememberClassAlias } from "@/lib/voice-memory";

type AmbiguousCommand = Extract<VoiceCommand, { type: "class-ambiguous" }>;
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: 'Hi! Ask me about your classes, or type a command like "open dashboard".',
};

export default function JarvisAssistant({ classes }: { classes: ClassRow[] }) {
  const router = useRouter();
  const params = useParams<{ classId?: string }>();
  const currentClassId = params?.classId;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState("");
  const [pendingAmbiguous, setPendingAmbiguous] = useState<AmbiguousCommand | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pushMessage = useCallback((role: ChatMessage["role"], text: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text }]);
  }, []);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingAmbiguous, open]);

  const classOptions: ClassOption[] = useMemo(
    () => classes.map((c) => ({ id: c.id, name: c.name })),
    [classes],
  );

  const runAnalyticsQuery = useCallback(
    async (question: AnalyticsQuestion, classId?: string): Promise<string> => {
      const supabase = createClient();

      if (classId) {
        const [{ data: classRow }, { data: students }, { data: attendance }, { data: gradingConfig }] =
          await Promise.all([
            supabase.from("classes").select("*").eq("id", classId).single(),
            supabase.from("students").select("*").eq("class_id", classId),
            supabase.from("attendance").select("*").eq("class_id", classId),
            supabase.from("grading_configs").select("*").eq("class_id", classId).maybeSingle(),
          ]);
        if (!classRow) return "I couldn't find that class anymore.";
        return formatAnalyticsAnswer(question, {
          kind: "class",
          classRow: classRow as ClassRow,
          students: (students as Student[] | null) ?? [],
          attendance: (attendance as Attendance[] | null) ?? [],
          gradingConfig: (gradingConfig as GradingConfig | null) ?? null,
        });
      }

      const classIds = classOptions.map((c) => c.id);
      if (classIds.length === 0) return "You don't have any classes yet.";
      const [{ data: classRows }, { data: students }, { data: attendance }, { data: gradingConfigs }] =
        await Promise.all([
          supabase.from("classes").select("*").in("id", classIds),
          supabase.from("students").select("*").in("class_id", classIds),
          supabase.from("attendance").select("*").in("class_id", classIds),
          supabase.from("grading_configs").select("*").in("class_id", classIds),
        ]);

      const studentsByClass = new Map<string, Student[]>();
      for (const s of (students as Student[] | null) ?? []) {
        const list = studentsByClass.get(s.class_id) ?? [];
        list.push(s);
        studentsByClass.set(s.class_id, list);
      }
      const attendanceByClass = new Map<string, Attendance[]>();
      for (const a of (attendance as Attendance[] | null) ?? []) {
        const list = attendanceByClass.get(a.class_id) ?? [];
        list.push(a);
        attendanceByClass.set(a.class_id, list);
      }
      const configByClass = new Map<string, GradingConfig>(
        ((gradingConfigs as GradingConfig[] | null) ?? []).map((c) => [c.class_id, c]),
      );

      const stats = ((classRows as ClassRow[] | null) ?? []).map((c) =>
        computeClassStats(
          c,
          studentsByClass.get(c.id) ?? [],
          attendanceByClass.get(c.id) ?? [],
          configByClass.get(c.id) ?? null,
        ),
      );
      return formatAnalyticsAnswer(question, { kind: "all", stats });
    },
    [classOptions],
  );

  const handleCommand = useCallback(
    (command: VoiceCommand) => {
      setPendingAmbiguous(null);
      switch (command.type) {
        case "navigate": {
          pushMessage("assistant", `Opening ${command.label}.`);
          if (command.resolvedFrom) {
            rememberClassAlias(command.resolvedFrom.spokenName, command.resolvedFrom.classId);
          }
          router.push(command.path);
          break;
        }
        case "start-session": {
          pushMessage("assistant", `Starting a session for ${command.className}.`);
          if (command.resolvedFrom) {
            rememberClassAlias(command.resolvedFrom.spokenName, command.resolvedFrom.classId);
          }
          router.push(`/checkin/${command.classId}?voice=start`);
          break;
        }
        case "end-session": {
          pushMessage("assistant", `Ending the session for ${command.className}.`);
          if (command.resolvedFrom) {
            rememberClassAlias(command.resolvedFrom.spokenName, command.resolvedFrom.classId);
          }
          router.push(`/checkin/${command.classId}?voice=end`);
          break;
        }
        case "analytics": {
          if (command.resolvedFrom) {
            rememberClassAlias(command.resolvedFrom.spokenName, command.resolvedFrom.classId);
          }
          runAnalyticsQuery(command.question, command.classId)
            .then((answer) => pushMessage("assistant", answer))
            .catch(() => {
              pushMessage("assistant", "Sorry, I couldn't load that just now — try again in a moment.");
            });
          break;
        }
        case "needs-class": {
          pushMessage("assistant", `Which class? Try "${command.label} for" and the class name.`);
          break;
        }
        case "class-not-found": {
          pushMessage("assistant", `I couldn't find a class called "${command.spokenName}".`);
          break;
        }
        case "class-ambiguous": {
          const names = command.matches.map((m) => m.name).join(", ");
          pushMessage(
            "assistant",
            `That matches more than one class: ${names}. Pick one below, or say it again more specifically.`,
          );
          setPendingAmbiguous(command);
          break;
        }
        case "reset-memory": {
          forgetClassAliases();
          pushMessage("assistant", "Okay — I've forgotten every class name I've learned.");
          break;
        }
        case "memory-summary": {
          pushMessage("assistant", describeClassAliases(getClassAliases(), classOptions));
          break;
        }
        case "unrecognized": {
          pushMessage("assistant", `I didn't understand "${command.transcript}".`);
          break;
        }
      }
    },
    [router, pushMessage, runAnalyticsQuery, classOptions],
  );

  const resolveAmbiguous = useCallback(
    (classId: string) => {
      if (!pendingAmbiguous) return;
      const chosen = classOptions.find((c) => c.id === classId);
      if (chosen) pushMessage("user", chosen.name);
      handleCommand(
        resolveClassChoice(pendingAmbiguous.intent, pendingAmbiguous.spokenName, classId, classOptions),
      );
    },
    [pendingAmbiguous, classOptions, handleCommand, pushMessage],
  );

  const runTypedCommand = useCallback(
    (text: string) => {
      pushMessage("user", text);
      const aliases = getClassAliases();
      handleCommand(parseVoiceCommand(text, { classes: classOptions, currentClassId, aliases }));
    },
    [classOptions, currentClassId, handleCommand, pushMessage],
  );

  const handleSubmitText = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputText.trim();
      if (!text) return;
      setInputText("");
      runTypedCommand(text);
    },
    [inputText, runTypedCommand],
  );

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[28rem] w-80 flex-col overflow-hidden rounded-lg border border-rule/40 bg-paper shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-rule/40 bg-chalk px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass text-chalk">
                <WaveformIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display text-sm font-semibold text-paper">Jarvis</p>
                <p className="text-[11px] text-rule">Commands &amp; class analytics</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close Jarvis"
              className="text-rule transition hover:text-paper"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="subtle-scroll flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-1.5 text-sm ${
                    m.role === "user" ? "bg-brass text-chalk" : "bg-chalk text-paper"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5">
                {(currentClassId
                  ? ["How's this class doing?", "Who's below attendance?", "Any warnings?"]
                  : ["Show analytics overview", "Who's below attendance?", "Any warnings?"]
                ).map((question) => (
                  <button
                    key={question}
                    onClick={() => runTypedCommand(question)}
                    className="rounded-full border border-teal/50 px-2.5 py-1 text-xs text-teal transition hover:bg-teal hover:text-paper"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            {pendingAmbiguous && (
              <div className="flex flex-wrap gap-1.5">
                {pendingAmbiguous.matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => resolveAmbiguous(m.id)}
                    className="rounded-sm border border-brass/60 px-2 py-1 text-xs text-brass transition hover:bg-brass hover:text-chalk"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmitText} className="flex items-center gap-1.5 border-t border-rule/40 px-2 py-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a command..."
              className="min-w-0 flex-1 rounded-sm border border-rule/50 bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brass"
            />
            <button
              type="submit"
              className="shrink-0 rounded-sm bg-teal px-3 py-1.5 text-sm font-medium text-paper transition hover:brightness-110"
            >
              Send
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Jarvis" : "Chat with Jarvis"}
        title={open ? "Close Jarvis" : "Chat with Jarvis"}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-rule/40 bg-brass text-chalk shadow-lg transition hover:brightness-110"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <WaveformIcon className="h-6 w-6" />}
      </button>
    </div>
  );
}

function WaveformIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <polyline
        points="1,12 4,12 5,7 6,17 7,12 8,9 9,15 10,12 11,3 12,21 13,7 14,15 15,10 16,14 17,12 18,9 19,15 20,12 23,12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
