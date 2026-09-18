import type { SupabaseClient } from "@supabase/supabase-js";

export type DeviceLockResult =
  | { ok: true }
  | { ok: false; error: string; needsConfirmation?: boolean };

// A student's code locks to whichever device it's first successfully used
// from, so a classmate can't act on their behalf from their own phone --
// and a device locks to whichever student it first resolves, so that same
// phone can't then act as a second, third, ... classmate just because
// *they* don't have a device bound yet. Shared by every route that
// resolves a student purely by code (self check-in, student profile view)
// so the two checks never drift out of sync with each other.
//
// `students` rows are per-class enrollments -- the same real person taking
// several subjects has one row (and one QR code) per class, per
// students.class_id. Comparing by row id alone treated every one of those
// rows as a different "student", so a phone that already bound to a
// person's Subject A row got rejected the moment they tried to self
// check-in on their own Subject B row. Comparing by name instead (already
// normalized to "Lastname, Firstname M.I." everywhere by lib/name-format.ts)
// tells "same person, different subject" apart from an actual classmate.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function checkDeviceLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  student: { id: string; name: string; device_id: string | null },
  deviceId: string | null,
  // Set once the student has actively confirmed "yes, this is me" in
  // response to a needsConfirmation response below -- skips straight to ok
  // so the caller can rebind the device instead of hard-blocking forever.
  // Most mismatches turn out to be a student's own phone losing its
  // remembered id (browser storage cleared, switching between Safari and
  // an installed home-screen app) rather than an actual different person,
  // so an unrecoverable block was costing far more legitimate check-ins
  // than it was stopping impersonation -- a confirmation click is a real,
  // if imperfect, deterrent against casually using a classmate's code.
  confirmed = false,
): Promise<DeviceLockResult> {
  if (!deviceId) return { ok: true };
  if (confirmed) return { ok: true };

  const { data: deviceOwners } = await supabase
    .from("students")
    .select("id, name")
    .eq("device_id", deviceId)
    .neq("id", student.id);

  const impersonatingSomeoneElse = (deviceOwners ?? []).some(
    (owner: { name: string }) => normalizeName(owner.name) !== normalizeName(student.name),
  );

  if (impersonatingSomeoneElse) {
    return {
      ok: false,
      needsConfirmation: true,
      error: "This device was last used to check in a different student. Continue if this is actually you.",
    };
  }

  if (student.device_id && student.device_id !== deviceId) {
    return {
      ok: false,
      needsConfirmation: true,
      error: "This looks like a different device than last time. Continue if this is your device.",
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

// Overwrites whatever device this row was previously bound to. Only ever
// called after checkDeviceLock's needsConfirmation was shown and the
// student actively confirmed it's really them -- an unconditional bind
// (unlike bindDeviceIfUnset above) is exactly what that confirmation is
// authorizing.
export async function rebindDevice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  student: { id: string },
  deviceId: string | null,
) {
  if (deviceId) {
    await supabase.from("students").update({ device_id: deviceId }).eq("id", student.id);
  }
}
