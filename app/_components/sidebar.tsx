"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams } from "next/navigation";
import type { ClassRow } from "@/lib/types";
import SidebarIcon, { type IconName } from "./sidebar-icons";
import { useActiveClasses } from "./active-classes-context";
import packageJson from "@/package.json";

function LogoBadge({ size = "h-9 w-9" }: { size?: string }) {
  return (
    <span className={`relative flex ${size} shrink-0`}>
      <Image
        src="/logo-icon.png"
        alt="GAINS"
        width={512}
        height={512}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

// Icon-only rail button (desktop): filled navy-soft background + a gold
// underline bar when active, plus a custom floating label on hover (not
// the native title attribute, which is slow to appear and unstyled).
function RailButton({
  icon,
  label,
  active,
  href,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <span
      className={`flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg transition ${
        active ? "bg-navy-soft text-card" : "text-card/70 hover:bg-navy-soft/60 hover:text-card"
      }`}
    >
      <SidebarIcon name={icon} className="h-6 w-6" />
      <span className={`h-0.5 w-4 rounded-full ${active ? "bg-gold" : "bg-transparent"}`} />
    </span>
  );
  const tooltip = (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-navy-soft px-2.5 py-1.5 text-xs font-medium text-card opacity-0 shadow-lg transition group-hover:opacity-100">
      {label}
    </span>
  );
  const className = "group relative flex justify-center";
  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {inner}
        {tooltip}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {inner}
      {tooltip}
    </button>
  );
}

export default function Sidebar({
  classes,
  email,
  isAdmin = false,
}: {
  classes: ClassRow[];
  email: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const classesRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const params = useParams<{ classId?: string }>();
  const activeClassId = params?.classId;
  const { extraActiveClassIds } = useActiveClasses();

  const isDashboardActive = pathname === "/dashboard";
  const isScheduleActive = pathname === "/schedule";
  const isStudentsActive = pathname === "/students";
  const isAttendanceActive = pathname === "/attendance";
  const isGradebookActive = pathname === "/gradebook";
  const isMessagesActive = pathname === "/messages";
  const isAdminActive = pathname === "/admin/teachers";
  const isAnyClassActive =
    extraActiveClassIds.size > 0 ? extraActiveClassIds.size > 0 : Boolean(activeClassId);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (classesRef.current && !classesRef.current.contains(e.target as Node)) {
        setClassesOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  function navClass(active: boolean) {
    return `mt-1 flex items-center gap-2.5 rounded-md border-l-[3px] py-2 pl-[9px] pr-3 text-sm transition ${
      active
        ? "border-gold bg-navy-soft font-semibold text-card"
        : "border-transparent text-card/70 hover:bg-navy-soft/60 hover:text-card"
    }`;
  }

  // Mobile drawer only -- a solid gold pill for the active item instead of
  // the thin left-border accent above, to match the icon rail/top bar's
  // gold-fill "pill portal" treatment introduced when the desktop nav was
  // redesigned (the mobile drawer itself was carried over unchanged at the
  // time, per the comment below).
  function mobileNavClass(active: boolean) {
    return `mt-1 flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm transition ${
      active ? "bg-gold font-semibold text-navy" : "text-card/70 hover:bg-navy-soft/60 hover:text-card"
    }`;
  }

  return (
    <>
      {/* Mobile top strip + slide-over drawer: kept text-labeled (unlike the
          desktop rail below) since a narrow icon-only rail with hover
          tooltips doesn't translate to a touch/mobile viewport. */}
      <div className="flex items-center justify-between border-b border-line/20 bg-navy px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <LogoBadge size="h-8 w-8" />
          <p className="font-display text-lg font-semibold text-card">
            GAINS
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-sm border border-line/40 p-2 text-card"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col bg-navy transition-transform duration-200 md:hidden ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex h-[86px] items-center justify-between border-b border-line/20 px-5">
          <div className="flex items-center gap-3">
            <LogoBadge />
            <div>
              <p className="font-display text-xl font-semibold text-card">
                GAINS
              </p>
              <p className="mt-0.5 text-xs text-card/70">
                Teacher portal
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-card/70 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 2l14 14M16 2L2 16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <nav className="subtle-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 text-xs font-semibold text-card/70">
            Main
          </p>
          <Link href="/dashboard" onClick={closeMenu} className={mobileNavClass(isDashboardActive)}>
            <SidebarIcon name="dashboard" />
            Dashboard
          </Link>
          <Link href="/schedule" onClick={closeMenu} className={mobileNavClass(isScheduleActive)}>
            <SidebarIcon name="schedule" />
            Schedule
          </Link>
          <Link href="/students" onClick={closeMenu} className={mobileNavClass(isStudentsActive)}>
            <SidebarIcon name="students" />
            Students
          </Link>
          <Link href="/attendance" onClick={closeMenu} className={mobileNavClass(isAttendanceActive)}>
            <SidebarIcon name="attendance" />
            Attendance
          </Link>
          <Link href="/gradebook" onClick={closeMenu} className={mobileNavClass(isGradebookActive)}>
            <SidebarIcon name="gradebook" />
            Gradebook
          </Link>
          <Link href="/messages" onClick={closeMenu} className={mobileNavClass(isMessagesActive)}>
            <SidebarIcon name="messages" />
            Messages
          </Link>

          {isAdmin && (
            <>
              <p className="mt-6 px-2 text-xs font-semibold text-card/70">
                Admin
              </p>
              <Link
                href="/admin/teachers"
                onClick={closeMenu}
                className={mobileNavClass(isAdminActive)}
              >
                <SidebarIcon name="admin" />
                Teacher accounts
              </Link>
            </>
          )}

          <p className="mt-6 px-2 text-xs font-semibold text-card/70">
            Classes
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {classes.map((c) => {
              const active =
                extraActiveClassIds.size > 0 ? extraActiveClassIds.has(c.id) : activeClassId === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/classes/${c.id}`}
                  onClick={closeMenu}
                  className={mobileNavClass(active)}
                >
                  <SidebarIcon name="class" />
                  <span className="truncate">{c.name}</span>
                </Link>
              );
            })}
            {classes.length === 0 && (
              <p className="px-3 py-2 text-sm text-card/70">No classes yet</p>
            )}
          </div>
        </nav>

        <div className="border-t border-line/20 px-4 py-4">
          <p className="truncate text-xs text-card/70">{email}</p>
        </div>
      </aside>

      {/* Desktop icon rail: ~70px wide, tooltip-on-hover in place of text
          labels -- the teacher's name/avatar and account menu now live in
          the top bar instead of down here. */}
      <aside className="hidden shrink-0 flex-col items-center gap-1 rounded-xl bg-navy py-4 md:m-4 md:flex md:w-[70px]">
        <Link href="/dashboard" title="GAINS" aria-label="GAINS dashboard" className="mb-4 flex justify-center">
          <LogoBadge size="h-9 w-9" />
        </Link>

        <RailButton icon="dashboard" label="Dashboard" href="/dashboard" active={isDashboardActive} />
        <RailButton icon="schedule" label="Schedule" href="/schedule" active={isScheduleActive} />
        <RailButton icon="students" label="Students" href="/students" active={isStudentsActive} />
        <RailButton icon="attendance" label="Attendance" href="/attendance" active={isAttendanceActive} />
        <RailButton icon="gradebook" label="Gradebook" href="/gradebook" active={isGradebookActive} />
        <RailButton icon="messages" label="Messages" href="/messages" active={isMessagesActive} />

        <div ref={classesRef} className="relative">
          <RailButton
            icon="classes"
            label="Classes"
            active={isAnyClassActive || classesOpen}
            onClick={() => setClassesOpen((v) => !v)}
          />
          {classesOpen && (
            <div className="absolute left-full top-0 z-50 ml-2 w-64 rounded-xl bg-navy p-2 shadow-lg">
              <p className="px-2 py-1 text-xs font-semibold text-card/70">Classes</p>
              <div className="subtle-scroll flex max-h-80 flex-col gap-0.5 overflow-y-auto">
                {classes.map((c) => {
                  const active =
                    extraActiveClassIds.size > 0 ? extraActiveClassIds.has(c.id) : activeClassId === c.id;
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/classes/${c.id}`}
                      onClick={() => setClassesOpen(false)}
                      className={navClass(active)}
                    >
                      <SidebarIcon name="class" />
                      <span className="truncate">{c.name}</span>
                    </Link>
                  );
                })}
                {classes.length === 0 && (
                  <p className="px-3 py-2 text-sm text-card/70">No classes yet</p>
                )}
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <RailButton icon="admin" label="Teacher accounts" href="/admin/teachers" active={isAdminActive} />
        )}

        <p className="mt-auto pt-2 text-[10px] font-medium text-card/40">v{packageJson.version}</p>
      </aside>
    </>
  );
}
