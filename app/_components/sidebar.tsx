"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { ClassRow } from "@/lib/types";
import SignOutButton from "./sign-out-button";

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

  const isDashboardActive = pathname === "/dashboard";
  const isScheduleActive = pathname === "/schedule";
  const isStudentsActive = pathname === "/students";
  const isAttendanceActive = pathname === "/attendance";
  const isAdminActive = pathname === "/admin/teachers";

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-rule/20 bg-chalk px-4 py-3 md:hidden">
        <p className="font-display text-lg font-semibold text-paper">
          Roll Call
        </p>
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 -translate-x-full flex-col bg-chalk transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-rule/20 px-5 py-5">
          <div>
            <p className="font-display text-xl font-semibold text-paper">
              Roll Call
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-rule">
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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule/70">
            Overview
          </p>
          <Link
            href="/dashboard"
            onClick={closeMenu}
            className={`mt-1 flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
              isDashboardActive
                ? "border-brass bg-white/5 font-medium text-paper"
                : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/schedule"
            onClick={closeMenu}
            className={`mt-1 flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
              isScheduleActive
                ? "border-brass bg-white/5 font-medium text-paper"
                : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
            }`}
          >
            Schedule
          </Link>
          <Link
            href="/students"
            onClick={closeMenu}
            className={`mt-1 flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
              isStudentsActive
                ? "border-brass bg-white/5 font-medium text-paper"
                : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
            }`}
          >
            Students
          </Link>
          <Link
            href="/attendance"
            onClick={closeMenu}
            className={`mt-1 flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
              isAttendanceActive
                ? "border-brass bg-white/5 font-medium text-paper"
                : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
            }`}
          >
            Attendance
          </Link>
          {isAdmin && (
            <Link
              href="/admin/teachers"
              onClick={closeMenu}
              className={`mt-1 flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
                isAdminActive
                  ? "border-brass bg-white/5 font-medium text-paper"
                  : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
              }`}
            >
              Admin
            </Link>
          )}

          <p className="mt-6 px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-rule/70">
            Classes
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {classes.map((c) => {
              const active = activeClassId === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/classes/${c.id}`}
                  onClick={closeMenu}
                  className={`flex items-center rounded-sm border-l-2 px-3 py-2 text-sm transition ${
                    active
                      ? "border-brass bg-white/5 font-medium text-paper"
                      : "border-transparent text-rule hover:bg-white/5 hover:text-paper"
                  }`}
                >
                  {c.name}
                </Link>
              );
            })}
            {classes.length === 0 && (
              <p className="px-3 py-2 text-sm text-rule/60">No classes yet</p>
            )}
          </div>
        </nav>

        <div className="border-t border-rule/20 px-4 py-4">
          <p className="truncate font-mono text-xs text-rule">{email}</p>
          <Link
            href="/profile"
            onClick={closeMenu}
            className="mt-2 block text-sm text-rule underline underline-offset-2 hover:text-paper"
          >
            Edit profile
          </Link>
          <SignOutButton className="mt-2 w-full" />
        </div>
      </aside>
    </>
  );
}
