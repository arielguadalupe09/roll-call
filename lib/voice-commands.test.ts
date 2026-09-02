import { describe, expect, it } from "vitest";
import { matchClass, parseVoiceCommand, resolveClassChoice } from "./voice-commands";

const classes = [
  { id: "1", name: "Web Development" },
  { id: "2", name: "Database Systems" },
  { id: "3", name: "Web Design" },
];

describe("matchClass", () => {
  it("matches exact names case-insensitively", () => {
    expect(matchClass("web development", classes)).toEqual([classes[0]]);
  });

  it("matches on substring", () => {
    expect(matchClass("database", classes)).toEqual([classes[1]]);
  });

  it("returns multiple matches when ambiguous", () => {
    const result = matchClass("web", classes);
    expect(result.map((c) => c.id).sort()).toEqual(["1", "3"]);
  });

  it("returns no matches for unrelated names", () => {
    expect(matchClass("chemistry", classes)).toEqual([]);
  });
});

describe("parseVoiceCommand", () => {
  it("navigates to static routes", () => {
    expect(parseVoiceCommand("open dashboard", { classes })).toEqual({
      type: "navigate",
      path: "/dashboard",
      label: "Dashboard",
    });
  });

  it("strips a jarvis wake word", () => {
    expect(parseVoiceCommand("hey jarvis, open dashboard", { classes })).toEqual({
      type: "navigate",
      path: "/dashboard",
      label: "Dashboard",
    });
  });

  it("opens a class by name", () => {
    expect(parseVoiceCommand("open class database systems", { classes })).toEqual({
      type: "navigate",
      path: "/dashboard/classes/2",
      label: "Class for Database Systems",
      resolvedFrom: { spokenName: "database systems", classId: "2" },
    });
  });

  it("reports class-not-found for an unknown class", () => {
    expect(parseVoiceCommand("scan for chemistry", { classes })).toEqual({
      type: "class-not-found",
      spokenName: "chemistry",
    });
  });

  it("reports class-ambiguous when multiple classes match, carrying the intent", () => {
    const result = parseVoiceCommand("open class web", { classes });
    expect(result).toMatchObject({ type: "class-ambiguous", spokenName: "web", intent: "open-class" });
  });

  it("starts a session for a named class", () => {
    expect(parseVoiceCommand("start a session for web development", { classes })).toEqual({
      type: "start-session",
      classId: "1",
      className: "Web Development",
      resolvedFrom: { spokenName: "web development", classId: "1" },
    });
  });

  it("starts a session for the current class when no name is given", () => {
    expect(parseVoiceCommand("start a session", { classes, currentClassId: "2" })).toEqual({
      type: "start-session",
      classId: "2",
      className: "Database Systems",
    });
  });

  it("asks which class when starting a session with no context", () => {
    expect(parseVoiceCommand("start a session", { classes })).toEqual({
      type: "needs-class",
      label: "start a session",
    });
  });

  it("ends a session for the current class", () => {
    expect(parseVoiceCommand("end the session", { classes, currentClassId: "1" })).toEqual({
      type: "end-session",
      classId: "1",
      className: "Web Development",
    });
  });

  it("returns unrecognized for gibberish", () => {
    expect(parseVoiceCommand("what's the weather today", { classes }).type).toBe("unrecognized");
  });

  it("uses a learned alias to resolve what would otherwise be ambiguous", () => {
    const aliases = { web: "3" };
    expect(parseVoiceCommand("open class web", { classes, aliases })).toEqual({
      type: "navigate",
      path: "/dashboard/classes/3",
      label: "Class for Web Design",
      resolvedFrom: { spokenName: "web", classId: "3" },
    });
  });

  it("ignores an alias pointing at a class that no longer exists", () => {
    const aliases = { web: "deleted-id" };
    const result = parseVoiceCommand("open class web", { classes, aliases });
    expect(result.type).toBe("class-ambiguous");
  });

  it("recognizes a request to forget learned aliases", () => {
    expect(parseVoiceCommand("forget everything", { classes })).toEqual({ type: "reset-memory" });
    expect(parseVoiceCommand("reset jarvis", { classes })).toEqual({ type: "reset-memory" });
  });
});

describe("resolveClassChoice", () => {
  it("builds the command for a manually disambiguated class and records what was said", () => {
    expect(resolveClassChoice("scan", "web", "3", classes)).toEqual({
      type: "navigate",
      path: "/scan/3",
      label: "Scanner for Web Design",
      resolvedFrom: { spokenName: "web", classId: "3" },
    });
  });
});

describe("parseVoiceCommand — analytics", () => {
  it("answers about the current class when no name is given", () => {
    expect(parseVoiceCommand("show analytics overview", { classes, currentClassId: "2" })).toEqual({
      type: "analytics",
      question: "overview",
      classId: "2",
      className: "Database Systems",
    });
  });

  it("falls back to an aggregate answer with no class in view", () => {
    expect(parseVoiceCommand("show analytics overview", { classes })).toEqual({
      type: "analytics",
      question: "overview",
    });
  });

  it("resolves a named class for a low-attendance question", () => {
    expect(parseVoiceCommand("who's at risk for web development", { classes })).toEqual({
      type: "analytics",
      question: "low-attendance",
      classId: "1",
      className: "Web Development",
      resolvedFrom: { spokenName: "web development", classId: "1" },
    });
  });

  it("reports class-ambiguous for warnings on an ambiguous name, carrying the analytics intent", () => {
    const result = parseVoiceCommand("any warnings for web", { classes });
    expect(result).toMatchObject({
      type: "class-ambiguous",
      spokenName: "web",
      intent: "analytics-warnings",
    });
  });

  it("does not hijack plain navigation to the attendance page", () => {
    expect(parseVoiceCommand("show attendance", { classes })).toEqual({
      type: "navigate",
      path: "/attendance",
      label: "Attendance",
    });
  });

  it("doesn't mistake the word 'class' in a natural question for a class name", () => {
    expect(parseVoiceCommand("how's this class doing", { classes, currentClassId: "2" })).toEqual({
      type: "analytics",
      question: "overview",
      classId: "2",
      className: "Database Systems",
    });
  });

  it("still resolves a named class for analytics when phrased with 'for'", () => {
    expect(parseVoiceCommand("how's web development doing", { classes })).toEqual({
      type: "analytics",
      question: "overview",
    });
    expect(parseVoiceCommand("overview for web development", { classes })).toEqual({
      type: "analytics",
      question: "overview",
      classId: "1",
      className: "Web Development",
      resolvedFrom: { spokenName: "web development", classId: "1" },
    });
  });
});

describe("parseVoiceCommand — memory summary", () => {
  it("recognizes a request to recall what's been learned", () => {
    expect(parseVoiceCommand("what have you learned", { classes })).toEqual({ type: "memory-summary" });
    expect(parseVoiceCommand("what do you remember", { classes })).toEqual({ type: "memory-summary" });
  });
});
