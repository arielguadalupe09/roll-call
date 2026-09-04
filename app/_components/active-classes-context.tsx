"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type ActiveClassesContextValue = {
  extraActiveClassIds: Set<string>;
  setExtraActiveClassIds: (ids: Set<string>) => void;
};

const ActiveClassesContext = createContext<ActiveClassesContextValue | null>(null);

// Lets a page (e.g. the multi-class assignment form's "Assign to classes"
// checkboxes) tell the sidebar to highlight exactly the classes selected
// there, instead of only whichever class is in the current URL. Consuming
// pages should clear this on unmount so it doesn't leak into other pages.
export function useActiveClasses() {
  const ctx = useContext(ActiveClassesContext);
  if (!ctx) throw new Error("useActiveClasses must be used within ActiveClassesProvider");
  return ctx;
}

export function ActiveClassesProvider({ children }: { children: ReactNode }) {
  const [extraActiveClassIds, setExtraActiveClassIds] = useState<Set<string>>(new Set());
  return (
    <ActiveClassesContext.Provider value={{ extraActiveClassIds, setExtraActiveClassIds }}>
      {children}
    </ActiveClassesContext.Provider>
  );
}
