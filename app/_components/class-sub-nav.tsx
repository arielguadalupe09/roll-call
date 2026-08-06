"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

export default function ClassSubNav() {
  const pathname = usePathname();
  const params = useParams<{ classId?: string }>();
  const classId = params?.classId;

  if (!classId) return null;

  const tools = [
    { label: "Students", href: `/dashboard/classes/${classId}` },
    { label: "Print QR", href: `/qr/${classId}` },
    { label: "Scan", href: `/scan/${classId}` },
    { label: "Self Check-in", href: `/checkin/${classId}` },
    { label: "Attendance", href: `/attendance/${classId}` },
    { label: "Records", href: `/records/${classId}` },
    { label: "Participation", href: `/participation/${classId}` },
    { label: "Announcements", href: `/announcements/${classId}` },
    { label: "Materials", href: `/materials/${classId}` },
    { label: "Assignments", href: `/assignments/${classId}` },
    { label: "Grading", href: `/gradebook/${classId}` },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-rule/60 pb-3">
      {tools.map((tool) => {
        const active = pathname === tool.href;
        return (
          <Link
            key={tool.href}
            href={tool.href}
            className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
              active
                ? "bg-brass text-chalk font-semibold"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            {tool.label}
          </Link>
        );
      })}
    </div>
  );
}
