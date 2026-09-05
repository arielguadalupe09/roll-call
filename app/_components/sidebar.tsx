"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams } from "next/navigation";
import type { ClassRow } from "@/lib/types";
import SignOutButton from "./sign-out-button";
import SidebarIcon from "./sidebar-icons";
import { useActiveClasses } from "./active-classes-context";

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
  const pathname = usePathname();
  const params = useParams<{ classId?: string }>();
  const activeClassId = params?.classId;
  const { extraActiveClassIds } = useActiveClasses();

  const isDashboardActive = pathname === "/dashboard";
  const isScheduleActive = pathname === "/schedule";
  const isStudentsActive = pathname === "/students";
  const isAttendanceActive = pathname === "/attendance";
  const isAdminActive = pathname === "/admin/teachers";

  function closeMenu() {
    setOpen(false);
  }

  function navClass(active: boolean) {
    return `mt-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
      active
        ? "bg-brass font-semibold text-chalk"
        : "text-rule hover:bg-white/5 hover:text-paper"
    }`;
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-rule/20 bg-chalk px-4 py-3 md:hidden">
        <Image src="/logo-full.png" alt="GAINS" width={106} height={64} className="h-8 w-auto" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-sm border border-rule/40 p-2 text-paper"
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col bg-chalk transition-transform duration-200 md:static md:z-auto md:min-h-0 md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-rule/20 px-5 py-6 md:justify-center">
          <div className="text-center">
            <Image
              src="/logo-full.png"
              alt="GAINS"
              width={106}
              height={64}
              className="mx-auto h-20 w-auto"
            />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule">
              Teacher Portal
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-rule md:hidden"
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
          <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule/70">
            Main
          </p>
          <Link href="/dashboard" onClick={closeMenu} className={navClass(isDashboardActive)}>
            <SidebarIcon name="dashboard" />
            Dashboard
          </Link>
          <Link href="/schedule" onClick={closeMenu} className={navClass(isScheduleActive)}>
            <SidebarIcon name="schedule" />
            Schedule
          </Link>
          <Link href="/students" onClick={closeMenu} className={navClass(isStudentsActive)}>
            <SidebarIcon name="students" />
            Students
          </Link>
          <Link href="/attendance" onClick={closeMenu} className={navClass(isAttendanceActive)}>
            <SidebarIcon name="attendance" />
            Attendance
          </Link>

          {isAdmin && (
            <>
              <p className="mt-6 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule/70">
                Admin
              </p>
              <Link
                href="/admin/teachers"
                onClick={closeMenu}
                className={navClass(isAdminActive)}
              >
                <SidebarIcon name="admin" />
                Teacher accounts
              </Link>
            </>
          )}

          <p className="mt-6 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule/70">
            Classes
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {classes.map((c) => {
              // Normally driven by the URL's classId, but a page can
              // override this (e.g. the multi-class assignment form's
              // "Assign to classes" checkboxes) to highlight exactly
              // whichever classes are selected there instead.
              const active =
                extraActiveClassIds.size > 0 ? extraActiveClassIds.has(c.id) : activeClassId === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/classes/${c.id}`}
                  onClick={closeMenu}
                  className={navClass(active)}
                >
                  <SidebarIcon name="class" />
                  <span className="truncate">{c.name}</span>
                </Link>
              );
            })}
            {classes.length === 0 && (
              <p className="px-3 py-2 text-sm text-rule/60">No classes yet</p>
            )}
          </div>
        </nav>

        <div className="border-t border-rule/20 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-rule">
              <SidebarIcon name="user" className="h-4 w-4" />
            </span>
            <p className="truncate font-mono text-xs text-rule">{email}</p>
          </div>
          <Link
            href="/profile"
            onClick={closeMenu}
            className="mt-2 block text-sm text-rule underline underline-offset-2 hover:text-paper"
          >
            Edit profile
          </Link>
          <SignOutButton className="mt-3 w-full" />
        </div>
      </aside>
    </>
  );
}
