"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useParams } from "next/navigation";
import GroupedNav, { type NavItem } from "./grouped-nav";

const LAST_CLASS_KEY = "rollcall:last-class-id";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLastClassId() {
  return localStorage.getItem(LAST_CLASS_KEY);
}

function getServerLastClassId() {
  return null;
}

export default function ClassSubNav() {
  const pathname = usePathname();
  const params = useParams<{ classId?: string }>();
  const routeClassId = params?.classId;

  // Persist the class whenever we're on one of its pages, so it can still
  // be shown as a fallback from global Sidebar pages (Dashboard, Schedule,
  // the global Students/Attendance lists) that aren't tied to any class.
  useEffect(() => {
    if (routeClassId) localStorage.setItem(LAST_CLASS_KEY, routeClassId);
  }, [routeClassId]);

  const lastClassId = useSyncExternalStore(subscribe, getLastClassId, getServerLastClassId);
  const classId = routeClassId ?? lastClassId;

  if (!classId) return null;

  const studentsHref = `/dashboard/classes/${classId}`;

  const items: NavItem[] = [
    { kind: "tool", label: "Students", href: studentsHref, active: pathname === studentsHref },
    {
      kind: "group",
      label: "Attendance",
      tools: [
        { label: "Print QR", href: `/qr/${classId}`, active: pathname === `/qr/${classId}` },
        { label: "Scan", href: `/scan/${classId}`, active: pathname === `/scan/${classId}` },
        {
          label: "Self Check-in",
          href: `/checkin/${classId}`,
          active: pathname === `/checkin/${classId}`,
        },
        {
          label: "Attendance",
          href: `/attendance/${classId}`,
          active: pathname === `/attendance/${classId}`,
        },
        {
          label: "Records",
          href: `/records/${classId}`,
          active: pathname === `/records/${classId}`,
        },
        {
          label: "Participation",
          href: `/participation/${classId}`,
          active: pathname === `/participation/${classId}`,
        },
      ],
    },
    {
      kind: "group",
      label: "Classroom",
      tools: [
        {
          label: "Announcements",
          href: `/announcements/${classId}`,
          active: pathname === `/announcements/${classId}`,
        },
        {
          label: "Materials",
          href: `/materials/${classId}`,
          active: pathname === `/materials/${classId}`,
        },
        {
          label: "Lectures",
          href: `/lectures/${classId}`,
          active: pathname === `/lectures/${classId}`,
        },
      ],
    },
    {
      kind: "group",
      label: "Gradebook",
      tools: [
        {
          label: "Assignments",
          href: `/assignments/${classId}`,
          active: pathname === `/assignments/${classId}`,
        },
        {
          label: "Grading",
          href: `/gradebook/${classId}`,
          active: pathname === `/gradebook/${classId}`,
        },
        {
          label: "Record Cards",
          href: `/record-card/${classId}`,
          active: pathname.startsWith(`/record-card/${classId}`),
        },
      ],
    },
  ];

  return <GroupedNav items={items} />;
}
