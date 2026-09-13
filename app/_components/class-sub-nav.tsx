"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useParams, useSearchParams } from "next/navigation";
import GroupedNav, { type NavItem } from "./grouped-nav";
import { useGradebookTab } from "./gradebook-tab-context";

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
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const params = useParams<{ classId?: string }>();
  const routeClassId = params?.classId;
  const { tab: sharedTab, setTab: setSharedTab } = useGradebookTab();

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
  const gradebookHref = `/gradebook/${classId}`;
  const onGradebookPage = pathname === gradebookHref;
  // While already on this class's gradebook page, GradingHubClient already
  // holds every tab's data -- switching tabs just needs to flip its local
  // state via the shared context and patch the URL for bookmarking, instead
  // of a real navigation that would re-run the page's ~12 data queries for
  // no new data. Only fall back to a real Link when arriving from elsewhere.
  const effectiveTab = onGradebookPage ? (sharedTab ?? tabParam) : tabParam;

  function gradebookTabTool(label: string, tabValue: "quiz" | "written" | "laboratory" | null, active: boolean) {
    const href = tabValue ? `${gradebookHref}?tab=${tabValue}` : gradebookHref;
    if (onGradebookPage) {
      return {
        label,
        active,
        onClick: () => {
          setSharedTab(tabValue ?? "overview");
          window.history.replaceState(null, "", href);
        },
      };
    }
    return { label, href, active };
  }

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
        gradebookTabTool(
          "Grading",
          null,
          onGradebookPage && effectiveTab !== "quiz" && effectiveTab !== "written" && effectiveTab !== "laboratory",
        ),
        gradebookTabTool("Quiz", "quiz", onGradebookPage && effectiveTab === "quiz"),
        {
          kind: "submenu",
          label: "Activities",
          tools: [
            gradebookTabTool("Written Activity", "written", onGradebookPage && effectiveTab === "written"),
            gradebookTabTool("Laboratory Activity", "laboratory", onGradebookPage && effectiveTab === "laboratory"),
          ],
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
