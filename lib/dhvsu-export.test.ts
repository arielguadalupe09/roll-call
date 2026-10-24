import { describe, expect, it } from "vitest";
import { normalizeCampus } from "./dhvsu-export";

describe("normalizeCampus", () => {
  it("rebuilds the template's 'DHVSU <Name>' dropdown form", () => {
    expect(normalizeCampus("Mexico Campus")).toBe("DHVSU Mexico");
    expect(normalizeCampus("mexico")).toBe("DHVSU Mexico");
    expect(normalizeCampus("DHVSU Mexico")).toBe("DHVSU Mexico");
    expect(normalizeCampus("Pampanga State University San Fernando Campus")).toBe("DHVSU San Fernando");
    expect(normalizeCampus("sto. tomas campus")).toBe("DHVSU Sto. Tomas");
  });

  it("keeps an unlisted campus name and leaves blanks blank", () => {
    expect(normalizeCampus("Main Campus")).toBe("DHVSU Main");
    expect(normalizeCampus(null)).toBe("");
    expect(normalizeCampus("  ")).toBe("");
  });
});
