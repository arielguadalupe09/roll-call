import { describe, expect, it } from "vitest";
import { formatTime12h } from "./time-format";

describe("formatTime12h", () => {
  it("formats afternoon times with PM and no leading zero", () => {
    expect(formatTime12h(new Date(2026, 8, 19, 18, 34, 46))).toBe("6:34 PM");
  });
  it("formats morning times with AM", () => {
    expect(formatTime12h(new Date(2026, 8, 19, 7, 30))).toBe("7:30 AM");
  });
  it("handles midnight and noon", () => {
    expect(formatTime12h(new Date(2026, 8, 19, 0, 5))).toBe("12:05 AM");
    expect(formatTime12h(new Date(2026, 8, 19, 12, 0))).toBe("12:00 PM");
  });
  it("includes seconds when asked", () => {
    expect(formatTime12h(new Date(2026, 8, 19, 18, 34, 46), { seconds: true })).toBe("6:34:46 PM");
  });
  it("accepts ISO strings", () => {
    expect(formatTime12h("2026-09-19T08:00:00")).toBe("8:00 AM");
  });
});
