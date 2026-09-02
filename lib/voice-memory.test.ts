import { beforeEach, describe, expect, it } from "vitest";
import { describeClassAliases, forgetClassAliases, getClassAliases, rememberClassAlias } from "./voice-memory";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: createMemoryStorage() },
    configurable: true,
  });
});

describe("voice-memory", () => {
  it("returns an empty map when nothing has been learned", () => {
    expect(getClassAliases()).toEqual({});
  });

  it("remembers a spoken phrase against a class id, normalized", () => {
    rememberClassAlias("My Web Class!", "class-1");
    expect(getClassAliases()).toEqual({ "my web class": "class-1" });
  });

  it("overwrites a previous alias for the same phrase", () => {
    rememberClassAlias("web", "class-1");
    rememberClassAlias("web", "class-2");
    expect(getClassAliases()).toEqual({ web: "class-2" });
  });

  it("forgets everything that was learned", () => {
    rememberClassAlias("web", "class-1");
    forgetClassAliases();
    expect(getClassAliases()).toEqual({});
  });
});

describe("describeClassAliases", () => {
  const classes = [{ id: "class-1", name: "Web Development" }];

  it("says nothing's been learned yet when there are no aliases", () => {
    expect(describeClassAliases({}, classes)).toBe("I haven't learned any class shortcuts yet.");
  });

  it("lists each phrase against its resolved class name", () => {
    const result = describeClassAliases({ web: "class-1" }, classes);
    expect(result).toContain('"web" → Web Development');
  });

  it("drops aliases whose class no longer exists", () => {
    const result = describeClassAliases({ web: "class-1", ghost: "deleted-id" }, classes);
    expect(result).toContain("Web Development");
    expect(result).not.toContain("ghost");
  });
});
