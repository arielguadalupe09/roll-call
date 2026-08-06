"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { generateSessionToken } from "@/lib/codes";
import { todayLocalDate } from "@/lib/date";
import type { Session } from "@/lib/types";

export default function SessionClient({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const [date, setDate] = useState(todayLocalDate());
  const [session, setSession] = useState<Session | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateRef = useRef(date);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const [{ data: sessionData }, { count: attendanceCount }] =
        await Promise.all([
          supabase
            .from("sessions")
            .select("*")
            .eq("class_id", classId)
            .eq("date", date)
            .is("closed_at", null)
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("class_id", classId)
            .eq("date", date),
        ]);

      if (cancelled) return;
      setSession((sessionData as Session | null) ?? null);
      setCount(attendanceCount ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [classId, date]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`attendance-${classId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance",
          filter: `class_id=eq.${classId}`,
        },
        (payload) => {
          if (payload.new.date === dateRef.current) {
            setCount((prev) => prev + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);

  async function startSession() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("sessions")
      .insert({ class_id: classId, date, token: generateSessionToken() })
      .select()
      .single();
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSession(data as Session);
  }

  async function rotateToken() {
    if (!session) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("sessions")
      .update({ token: generateSessionToken() })
      .eq("id", session.id)
      .select()
      .single();
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSession(data as Session);
  }

  async function endSession() {
    if (!session) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", session.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSession(null);
  }

  return (
    <div>
      <div className="flex flex-col items-center bg-chalk px-6 py-10 text-paper">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
        Self check-in session
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        {className}
      </h1>

      <label className="mt-4 flex items-center gap-2 text-sm">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={!!session}
          className="rounded-sm border border-rule bg-paper px-2 py-1 font-mono text-ink"
        />
      </label>

      {error && (
        <p className="mt-4 rounded-sm bg-danger/20 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {session ? (
        <>
          <div className="mt-8 rounded-sm border-4 border-brass bg-white p-6">
            <QRCodeSVG value={`SESSION|${session.token}`} size={240} />
          </div>
          <p className="mt-6 font-mono text-5xl font-semibold text-brass">
            {count}
          </p>
          <p className="text-rule">students checked in</p>

          <div className="mt-8 flex gap-3">
            <button
              onClick={rotateToken}
              disabled={loading}
              className="rounded-sm border border-rule px-4 py-2 font-medium text-paper transition hover:bg-white/10 disabled:opacity-60"
            >
              New code
            </button>
            <button
              onClick={endSession}
              disabled={loading}
              className="rounded-sm bg-danger px-4 py-2 font-medium text-paper transition hover:brightness-110 disabled:opacity-60"
            >
              End session
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={startSession}
          disabled={loading}
          className="mt-10 rounded-sm bg-brass px-6 py-3 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Starting..." : "Start session"}
        </button>
      )}
      </div>
    </div>
  );
}
