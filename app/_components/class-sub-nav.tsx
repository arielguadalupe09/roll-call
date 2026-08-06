"use client";

import { usePathname, useParams } from "next/navigation";
import GroupedNav, { type NavItem } from "./grouped-nav";

export default function ClassSubNav() {
  const pathname = usePathname();
  const params = useParams<{ classId?: string }>();
  const classId = params?.classId;

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
      ],
    },
  ];

  return <GroupedNav items={items} />;
}
