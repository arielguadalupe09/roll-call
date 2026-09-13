import { createClient, getUser, getTeacherRow } from "@/lib/supabase/server";
import type { ClassRow } from "@/lib/types";
import Sidebar from "@/app/_components/sidebar";
import ClassSubNav from "@/app/_components/class-sub-nav";
import JarvisAssistant from "@/app/_components/jarvis-assistant";
import { ActiveClassesProvider } from "@/app/_components/active-classes-context";
import { GradebookTabProvider } from "@/app/_components/gradebook-tab-context";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // getUser() and the classes list don't depend on each other -- running
  // them in parallel instead of sequentially avoids stacking two network
  // round trips on every single navigation.
  const [
    {
      data: { user },
    },
    { data: classes },
  ] = await Promise.all([
    getUser(),
    supabase.from("classes").select("*").eq("archived", false).order("name", { ascending: true }),
  ]);

  const teacher = user ? await getTeacherRow(user.id) : null;
  const isAdmin = teacher?.is_admin ?? false;

  const classRows = (classes as ClassRow[] | null) ?? [];

  return (
    <ActiveClassesProvider>
      <GradebookTabProvider>
        <div id="app-shell" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <Sidebar classes={classRows} email={user?.email ?? ""} isAdmin={isAdmin} />
          <main id="app-main" className="ledger-page min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="border-b border-rule/60 bg-paper px-4 pt-6 pb-3 sm:px-8">
              <ClassSubNav />
            </div>
            {children}
          </main>
          <JarvisAssistant classes={classRows} />
        </div>
      </GradebookTabProvider>
    </ActiveClassesProvider>
  );
}
