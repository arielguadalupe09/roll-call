"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClassRow } from "@/lib/types";
import type { Insight } from "@/lib/dashboard-insights";
import SidebarIcon from "./sidebar-icons";
import SignOutButton from "./sign-out-button";

type SearchStudent = { id: string; name: string; class_id: string };

// Insights are live-computed from current data (lib/dashboard-insights.ts),
// not persisted rows -- there's no id to mark read/dismissed against on a
// server. "Read"/"dismissed" state is therefore kept client-side only,
// keyed by the insight's own text (the closest thing to a stable id),
// same localStorage-backed-memory shape as lib/voice-memory.ts.
const NOTIF_READ_KEY = "rollcall:notif-read";
const NOTIF_DISMISSED_KEY = "rollcall:notif-dismissed";

function loadKeySet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveKeySet(key: string, value: Set<string>) {
  window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
}

function NotificationRow({
  insight,
  read,
  onMarkRead,
  onDismiss,
}: {
  insight: Insight;
  read: boolean;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-line/40 py-2 last:border-b-0">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          insight.severity === "warning" ? "bg-danger" : "bg-success"
        }`}
      />
      <p className={`min-w-0 flex-1 text-sm ${read ? "text-muted" : "font-medium text-ink"}`}>{insight.text}</p>
      <div className="flex shrink-0 items-center gap-1">
        {!read && (
          <button
            type="button"
            onClick={onMarkRead}
            aria-label="Mark as read"
            className="flex h-5 w-5 items-center justify-center rounded text-success hover:bg-success/10"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 8.5 6.5 12 13 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function TopBarClock() {
  // Lazy initializer (real timestamp immediately) + suppressHydrationWarning
  // below, same tradeoff as NextSessionWidget's clock: a one-off SSR/
  // hydration mismatch is expected and fine for a ticking clock.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  return (
    <p className="hidden shrink-0 whitespace-nowrap text-sm text-ink/70 md:block" suppressHydrationWarning>
      {dateLabel} <span className="mx-1 text-line">|</span> {timeLabel}
    </p>
  );
}

function NotificationGroup({
  label,
  items,
  readKeys,
  onMarkRead,
  onDismiss,
}: {
  label: string;
  items: Insight[];
  readKeys: Set<string>;
  onMarkRead: (text: string) => void;
  onDismiss: (text: string) => void;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="border-t border-line/60">
        {items.map((insight, i) => (
          <NotificationRow
            key={i}
            insight={insight}
            read={readKeys.has(insight.text)}
            onMarkRead={() => onMarkRead(insight.text)}
            onDismiss={() => onDismiss(insight.text)}
          />
        ))}
      </div>
    </div>
  );
}

// Persistent, identical-on-every-page top bar: search (classes + students),
// a notification bell wired to real dashboard insights (fetched once on
// mount from /api/notifications, not blocking SSR), and the teacher's
// name/avatar -- which also now owns the account menu (email, edit
// profile, sign out) that used to live in the sidebar footer.
export default function TopBar({
  classes,
  students,
  email,
  fullName,
}: {
  classes: ClassRow[];
  students: SearchStudent[];
  email: string;
  fullName: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [readKeys, setReadKeys] = useState<Set<string>>(() => loadKeySet(NOTIF_READ_KEY));
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => loadKeySet(NOTIF_DISMISSED_KEY));
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setInsights(data.insights as Insight[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      const insideBell = bellRef.current?.contains(target) || notifPanelRef.current?.contains(target);
      if (!insideBell) setBellOpen(false);
      if (avatarRef.current && !avatarRef.current.contains(target)) setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const q = query.trim().toLowerCase();
  const matchedClasses = q ? classes.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const matchedStudents = q
    ? students.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const hasMatches = matchedClasses.length > 0 || matchedStudents.length > 0;

  function goTo(href: string) {
    setQuery("");
    setSearchOpen(false);
    router.push(href);
  }

  function markInsightRead(text: string) {
    setReadKeys((prev) => {
      if (prev.has(text)) return prev;
      const next = new Set(prev).add(text);
      saveKeySet(NOTIF_READ_KEY, next);
      return next;
    });
  }

  function dismissInsight(text: string) {
    setDismissedKeys((prev) => {
      if (prev.has(text)) return prev;
      const next = new Set(prev).add(text);
      saveKeySet(NOTIF_DISMISSED_KEY, next);
      return next;
    });
  }

  function markAllInsightsRead() {
    if (!insights || insights.length === 0) return;
    setReadKeys((prev) => {
      const next = new Set(prev);
      for (const insight of insights) next.add(insight.text);
      saveKeySet(NOTIF_READ_KEY, next);
      return next;
    });
  }

  const visibleInsights = (insights ?? []).filter((i) => !dismissedKeys.has(i.text));
  const unreadCount = visibleInsights.filter((i) => !readKeys.has(i.text)).length;
  const attentionInsights = visibleInsights.filter((i) => i.severity === "warning");
  const updateInsights = visibleInsights.filter((i) => i.severity === "info");

  const displayName = fullName?.trim() || email.split("@")[0] || "Teacher";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative flex h-14 items-center justify-end gap-3 border-b border-line/60 bg-card px-4 sm:px-8">
      {/* Absolutely centered on the top bar itself (not just the leftover
          space next to the cluster) -- the cluster below stays a normal
          flex child so this doesn't need a matching spacer to balance. */}
      <div
        ref={searchRef}
        className="absolute left-1/2 hidden w-full max-w-sm -translate-x-1/2 sm:block"
      >
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <SidebarIcon name="search" className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search classes or students..."
          className="w-full rounded-lg border border-transparent bg-paper py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-gold"
        />
        {searchOpen && q && hasMatches && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl bg-card p-2 shadow-lg">
            {matchedClasses.length > 0 && (
              <div className="mb-1">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Classes
                </p>
                {matchedClasses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => goTo(`/dashboard/classes/${c.id}`)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-slate-light"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {matchedStudents.length > 0 && (
              <div>
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Students
                </p>
                {matchedStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => goTo(`/record-card/${s.class_id}/${s.id}`)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-slate-light"
                  >
                    {s.name}
                    <span className="ml-1.5 text-xs text-muted">{classById.get(s.class_id)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {searchOpen && q && !hasMatches && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl bg-card p-3 text-sm text-muted shadow-lg">
            No matches for &ldquo;{query}&rdquo;
          </div>
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-end gap-3 sm:flex-none">
        <TopBarClock />
        <div ref={bellRef}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink/70 hover:bg-slate-light"
          >
            <SidebarIcon name="bell" className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
            )}
          </button>
        </div>

        {bellOpen && (
          // Anchored to the whole right-hand cluster (clock/bell/avatar),
          // not just the bell's own narrow button -- so it lines up with
          // the profile on the far right instead of sprawling left across
          // the page. Still sits over the Students/Attendance/... tab row
          // below, but the translucent + blurred fill keeps that legible.
          <div
            ref={notifPanelRef}
            className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl bg-card/85 p-3 shadow-xl backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-semibold text-gold">Notifications</p>
              {visibleInsights.length > 0 && (
                <button
                  type="button"
                  onClick={markAllInsightsRead}
                  className="text-xs font-medium text-slate underline underline-offset-2 hover:text-ink"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="subtle-scroll mt-2 max-h-96 overflow-y-auto">
              {insights == null && <p className="px-1 py-2 text-sm text-muted">Loading...</p>}
              {insights && visibleInsights.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted">No issues detected.</p>
              )}
              {attentionInsights.length > 0 && (
                <NotificationGroup
                  label="Needs attention"
                  items={attentionInsights}
                  readKeys={readKeys}
                  onMarkRead={markInsightRead}
                  onDismiss={dismissInsight}
                />
              )}
              {updateInsights.length > 0 && (
                <NotificationGroup
                  label="Updates"
                  items={updateInsights}
                  readKeys={readKeys}
                  onMarkRead={markInsightRead}
                  onDismiss={dismissInsight}
                />
              )}
            </div>
          </div>
        )}

        <div ref={avatarRef} className="relative">
          <button
            onClick={() => setAvatarOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-slate-light"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-display text-sm font-semibold text-card">
              {initial}
            </span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-ink sm:block">
              {displayName}
            </span>
          </button>
          {avatarOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl bg-card p-3 shadow-lg">
              <p className="truncate text-xs text-muted">{email}</p>
              <Link
                href="/profile"
                onClick={() => setAvatarOpen(false)}
                className="mt-2 block text-sm text-ink underline underline-offset-2 hover:text-gold"
              >
                Edit profile
              </Link>
              <SignOutButton className="mt-3 w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
