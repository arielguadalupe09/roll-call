import { describe, expect, it } from "vitest";
import { checkDeviceLock } from "./student-device-lock";

type Row = { id: string; name: string; device_id: string | null };

// Mimics just the query shape checkDeviceLock actually chains:
// .from("students").select("id, name").eq("device_id", deviceId).neq("id", student.id)
function fakeSupabase(rows: Row[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: "device_id", deviceId: string) => ({
          neq: (_col2: "id", excludeId: string) => {
            const data = rows.filter((r) => r.device_id === deviceId && r.id !== excludeId);
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("checkDeviceLock", () => {
  it("allows a device with no rows bound to it yet", async () => {
    const supabase = fakeSupabase([]);
    const result = await checkDeviceLock(
      supabase,
      { id: "s1", name: "Cruz, Juan", device_id: null },
      "device-a",
    );
    expect(result).toEqual({ ok: true });
  });

  it("allows the same student's own device across a different class enrollment row", async () => {
    // Same person, two subjects -> two rows, same name, device already
    // bound to the other row.
    const supabase = fakeSupabase([{ id: "s1-subject-a", name: "Cruz, Juan", device_id: "device-a" }]);
    const result = await checkDeviceLock(
      supabase,
      { id: "s1-subject-b", name: "Cruz, Juan", device_id: null },
      "device-a",
    );
    expect(result).toEqual({ ok: true });
  });

  it("blocks a device already bound to a different student", async () => {
    const supabase = fakeSupabase([{ id: "s2", name: "Dela Cruz, Maria", device_id: "device-a" }]);
    const result = await checkDeviceLock(
      supabase,
      { id: "s1", name: "Cruz, Juan", device_id: null },
      "device-a",
    );
    expect(result.ok).toBe(false);
  });

  it("blocks when this exact row is already linked to a different device", async () => {
    const supabase = fakeSupabase([]);
    const result = await checkDeviceLock(
      supabase,
      { id: "s1", name: "Cruz, Juan", device_id: "device-old" },
      "device-new",
    );
    expect(result.ok).toBe(false);
  });

  it("allows a request with no deviceId at all", async () => {
    const supabase = fakeSupabase([{ id: "s2", name: "Dela Cruz, Maria", device_id: "device-a" }]);
    const result = await checkDeviceLock(
      supabase,
      { id: "s1", name: "Cruz, Juan", device_id: null },
      null,
    );
    expect(result).toEqual({ ok: true });
  });
});
