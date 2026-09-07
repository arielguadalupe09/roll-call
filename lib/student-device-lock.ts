import type { SupabaseClient } from "@supabase/supabase-js";

export type DeviceLockResult = { ok: true } | { ok: false; error: string };

// A student's code locks to whichever device it's first successfully used
// from, so a classmate can't act on their behalf from their own phone --
// and a device locks to whichever student it first resolves, so that same
// phone can't then act as a second, third, ... classmate just because
// *they* don't have a device bound yet. Shared by every route that
// resolves a student purely by code (self check-in, student profile view)
// so the two checks never drift out of sync with each other.
export async function checkDeviceLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  student: { id: string; device_id: string | null },
  deviceId: string | null,
): Promise<DeviceLockResult> {
  if (!deviceId) return { ok: true };

  const { data: deviceOwner } = await supabase
    .from("students")
    .select("id")
    .eq("device_id", deviceId)
    .neq("id", student.id)
    .maybeSingle();

  if (deviceOwner) {
    return {
      ok: false,
      error: "This device has already been used to check in a different student.",
    };
  }

  if (student.device_id && student.device_id !== deviceId) {
    return {
      ok: false,
      error:
        "This code is already linked to another device. Ask your teacher to reset it if this is your phone.",
    };
  }

  return { ok: true };
}

// Bind the device only once the caller's action has actually succeeded, so
// a blocked or failed attempt never claims a device on someone's behalf.
export async function bindDeviceIfUnset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  student: { id: string; device_id: string | null },
  deviceId: string | null,
) {
  if (deviceId && !student.device_id) {
    await supabase.from("students").update({ device_id: deviceId }).eq("id", student.id);
  }
}
