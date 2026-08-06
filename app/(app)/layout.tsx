import { createClient } from "@/lib/supabase/server";
import type { ClassRow } from "@/lib/types";
import Sidebar from "@/app/_components/sidebar";
import ClassSubNav from "@/app/_components/class-sub-nav";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .eq("archived", false)
    .order("name", { ascending: true });

  let isAdmin = false;
  if (user) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = teacher?.is_admin ?? false;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <Sidebar
        classes={(classes as ClassRow[] | null) ?? []}
        email={user?.email ?? ""}
        isAdmin={isAdmin}
      />
      <main className="ledger-page min-w-0 flex-1 overflow-y-auto">
        <div className="border-b border-rule/60 bg-paper px-4 pt-6 pb-3 sm:px-8">
          <ClassSubNav />
        </div>
        {children}
      </main>
    </div>
  );
}
