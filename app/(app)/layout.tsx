import { createClient, getUser, getTeacherRow } from "@/lib/supabase/server";
import type { ClassRow } from "@/lib/types";
import Sidebar from "@/app/_components/sidebar";
import TopBar from "@/app/_components/top-bar";
import ClassSubNav from "@/app/_components/class-sub-nav";
import JarvisAssistant from "@/app/_components/jarvis-assistant";
import { ActiveClassesProvider } from "@/app/_components/active-classes-context";
import { GradebookTabProvider } from "@/app/_components/gradebook-tab-context";

type SearchStudent = { id: string; name: string; class_id: string };

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

  const classRows = (classes as ClassRow[] | null) ?? [];
  const classIds = classRows.map((c) => c.id);

  // Neither depends on the other's result, only on user/classIds already
  // resolved above -- the teacher lookup (for admin + the top bar's display
  // name) and a minimal student list (for the top bar's search) run
  // together instead of stacking another round trip.
  const [teacher, studentsResult] = await Promise.all([
    user ? getTeacherRow(user.id) : Promise.resolve(null),
    classIds.length
      ? supabase.from("students").select("id, name, class_id").in("class_id", classIds)
      : Promise.resolve({ data: [] as SearchStudent[] }),
  ]);
  const isAdmin = teacher?.is_admin ?? false;
  const studentRows = (studentsResult.data as SearchStudent[] | null) ?? [];

  return (
    <ActiveClassesProvider>
      <GradebookTabProvider>
        <div id="app-shell" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <Sidebar classes={classRows} email={user?.email ?? ""} isAdmin={isAdmin} />
          <main id="app-main" className="ledger-page min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-card">
              <TopBar
                classes={classRows}
                students={studentRows}
                email={user?.email ?? ""}
                fullName={teacher?.full_name ?? null}
              />
              <div className="flex h-[86px] items-end border-b border-line px-4 pb-3 sm:px-8">
                <ClassSubNav />
              </div>
            </div>
            {children}
          </main>
          <JarvisAssistant classes={classRows} />
        </div>
      </GradebookTabProvider>
    </ActiveClassesProvider>
  );
}
