import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_ORDER,
  moveSection,
  resolveSectionOrder,
  sectionTitle,
} from "./record-card-layout";

describe("resolveSectionOrder", () => {
  it("returns the default order when nothing is stored", () => {
    expect(resolveSectionOrder(null)).toEqual(DEFAULT_SECTION_ORDER);
    expect(resolveSectionOrder(undefined)).toEqual(DEFAULT_SECTION_ORDER);
    expect(resolveSectionOrder({})).toEqual(DEFAULT_SECTION_ORDER);
  });

  it("respects a fully custom order", () => {
    const custom = [...DEFAULT_SECTION_ORDER].reverse();
    expect(resolveSectionOrder({ order: custom })).toEqual(custom);
  });

  it("appends sections missing from a stored order (e.g. added after the class was configured)", () => {
    const partial = resolveSectionOrder({ order: ["attendance", "quiz"] as never });
    expect(partial[0]).toBe("attendance");
    expect(partial[1]).toBe("quiz");
    expect(partial).toHaveLength(DEFAULT_SECTION_ORDER.length);
    expect(new Set(partial)).toEqual(new Set(DEFAULT_SECTION_ORDER));
  });

  it("drops unknown keys from a stored order", () => {
    const withJunk = resolveSectionOrder({
      order: ["assignment", "not-a-real-section"] as never,
    });
    expect(withJunk).not.toContain("not-a-real-section");
    expect(withJunk).toHaveLength(DEFAULT_SECTION_ORDER.length);
  });
});

describe("sectionTitle", () => {
  it("falls back to the default title when nothing is customized", () => {
    expect(sectionTitle(null, "laboratory")).toBe("Lab activities");
    expect(sectionTitle({}, "laboratory")).toBe("Lab activities");
    expect(sectionTitle({ titles: {} }, "laboratory")).toBe("Lab activities");
  });

  it("returns a custom title when set", () => {
    expect(sectionTitle({ titles: { laboratory: "Practical Work" } }, "laboratory")).toBe(
      "Practical Work",
    );
  });

  it("falls back to the default when a custom title is blank", () => {
    expect(sectionTitle({ titles: { laboratory: "   " } }, "laboratory")).toBe(
      "Lab activities",
    );
  });
});

describe("moveSection", () => {
  it("swaps a section with its predecessor when moving up", () => {
    const order = ["assignment", "recitation", "quiz"] as const;
    expect(moveSection([...order], "recitation", "up")).toEqual([
      "recitation",
      "assignment",
      "quiz",
    ]);
  });

  it("swaps a section with its successor when moving down", () => {
    const order = ["assignment", "recitation", "quiz"] as const;
    expect(moveSection([...order], "recitation", "down")).toEqual([
      "assignment",
      "quiz",
      "recitation",
    ]);
  });

  it("is a no-op at the boundaries", () => {
    const order = ["assignment", "recitation", "quiz"] as const;
    expect(moveSection([...order], "assignment", "up")).toEqual([...order]);
    expect(moveSection([...order], "quiz", "down")).toEqual([...order]);
  });

  it("is a no-op for a key not present in the order", () => {
    const order = ["assignment", "recitation"] as const;
    expect(moveSection([...order], "attendance", "up")).toEqual([...order]);
  });
});
