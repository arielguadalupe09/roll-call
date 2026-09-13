import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Teacher } from "@/lib/types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component - middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

// getUser() re-validates the session against the Auth server on every call
// (unlike getSession(), it never trusts the cookie alone) -- every
// authenticated route's layout AND page independently called it, so a
// single navigation paid for that round trip twice. React's cache() dedupes
// calls with the same arguments (none, here) within one request, so the
// page's call reuses the layout's already-resolved result instead of firing
// a second request.
export const getUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

// The layout (is_admin) and several pages (default_use_prelims, full
// profile) each queried the teachers table separately for the same row on
// the same request. Fetching the whole row once and letting every caller
// pick the columns it needs collapses those into a single round trip.
export const getTeacherRow = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("teachers").select("*").eq("id", userId).single();
  return data as Teacher | null;
});
