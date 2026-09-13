"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// GradingHubClient's tabs (Overview/Setup/Quiz/Written/...) already switch
// instantly via local state -- no navigation needed, since the gradebook
// page fetches data for every tab up front. But ClassSubNav's direct
// Quiz/Written/Laboratory sidebar links used to be plain <Link>s to
// `/gradebook/[classId]?tab=...`, and *any* searchParams change forces
// Next.js to re-run the page's Server Component (re-fetching everything
// the page needs, ~12 queries) even though the tab itself needs no new
// data. Sharing the active tab through this context lets ClassSubNav flip
// GradingHubClient's tab directly (and patch the URL via history.replaceState
// instead of a real navigation) when the user is already on that class's
// gradebook page, avoiding the reload entirely.
type GradebookTabContextValue = {
  tab: string | null;
  setTab: (tab: string) => void;
};

const GradebookTabContext = createContext<GradebookTabContextValue | null>(null);

export function GradebookTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<string | null>(null);
  return (
    <GradebookTabContext.Provider value={{ tab, setTab }}>{children}</GradebookTabContext.Provider>
  );
}

export function useGradebookTab() {
  const ctx = useContext(GradebookTabContext);
  if (!ctx) throw new Error("useGradebookTab must be used within GradebookTabProvider");
  return ctx;
}
