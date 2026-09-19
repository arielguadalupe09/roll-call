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

function getLastClassSlug() {
  return localStorage.getItem(LAST_CLASS_KEY);
}

function getServerLastClassSlug() {
  return null;
}

export default function ClassSubNav({ defaultClassSlug = null }: { defaultClassSlug?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const params = useParams<{ classSlug?: string }>();
  const routeClassSlug = params?.classSlug;
  const { tab: sharedTab, setTab: setSharedTab } = useGradebookTab();

  // Persist the class whenever we're on one of its pages, so it can still
  // be shown as a fallback from global Sidebar pages (Dashboard, Schedule,
  // the global Students/Attendance lists) that aren't tied to any class.
  useEffect(() => {
    if (routeClassSlug) localStorage.setItem(LAST_CLASS_KEY, routeClassSlug);
  }, [routeClassSlug]);

  const lastClassSlug = useSyncExternalStore(subscribe, getLastClassSlug, getServerLastClassSlug);
  // Before any class page has ever been visited on this browser (fresh
  // session, cleared storage, first login), fall back to the teacher's
  // first class instead of hiding the bar entirely.
  const classSlug = routeClassSlug ?? lastClassSlug ?? defaultClassSlug;

  if (!classSlug) return null;

  const studentsHref = `/dashboard/classes/${classSlug}`;
  const gradebookHref = `/gradebook/${classSlug}`;
  const onGradebookPage = pathname === gradebookHref;
  // While already on this class's gradebook page, GradingHubClient already
  // holds every tab's data -- switching tabs just needs to flip its local
  // state via the shared context and patch the URL for bookmarking, instead
  // of a real navigation that would re-run the page's ~12 data queries for
  // no new data. Only fall back to a real Link when arriving from elsewhere.
  const effectiveTab = onGradebookPage ? (sharedTab ?? tabParam) : tabParam;

  function gradebookTabTool(label: string, tabValue: "quiz" | "written" | "laboratory" | "major-exam" | null, active: boolean) {
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
        { label: "Print QR", href: `/qr/${classSlug}`, active: pathname === `/qr/${classSlug}` },
        { label: "Scan", href: `/scan/${classSlug}`, active: pathname === `/scan/${classSlug}` },
        {
          label: "Self Check-in",
          href: `/checkin/${classSlug}`,
          active: pathname === `/checkin/${classSlug}`,
        },
        {
          label: "Attendance",
          href: `/attendance/${classSlug}`,
          active: pathname === `/attendance/${classSlug}`,
        },
        {
          label: "Records",
          href: `/records/${classSlug}`,
          active: pathname === `/records/${classSlug}`,
        },
        {
          label: "Participation",
          href: `/participation/${classSlug}`,
          active: pathname === `/participation/${classSlug}`,
        },
      ],
    },
    {
      kind: "group",
      label: "Classroom",
      tools: [
        {
          label: "Announcements",
          href: `/announcements/${classSlug}`,
          active: pathname === `/announcements/${classSlug}`,
        },
        {
          label: "Materials",
          href: `/materials/${classSlug}`,
          active: pathname === `/materials/${classSlug}`,
        },
        {
          label: "Lectures",
          href: `/lectures/${classSlug}`,
          active: pathname === `/lectures/${classSlug}`,
        },
      ],
    },
    {
      kind: "group",
      label: "Gradebook",
      tools: [
        {
          label: "Assignments",
          href: `/assignments/${classSlug}`,
          active: pathname === `/assignments/${classSlug}`,
        },
        gradebookTabTool(
          "Grading",
          null,
          onGradebookPage &&
            effectiveTab !== "quiz" &&
            effectiveTab !== "written" &&
            effectiveTab !== "laboratory" &&
            effectiveTab !== "major-exam",
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
        gradebookTabTool("Major Exam", "major-exam", onGradebookPage && effectiveTab === "major-exam"),
        {
          label: "Record Cards",
          href: `/record-card/${classSlug}`,
          active: pathname.startsWith(`/record-card/${classSlug}`),
        },
      ],
    },
  ];

  return <GroupedNav items={items} />;
}
