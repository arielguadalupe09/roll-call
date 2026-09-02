import { normalize, type ClassOption } from "./voice-commands";

const STORAGE_KEY = "rollcall_voice_aliases";

type AliasMap = Record<string, string>;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAliases(): AliasMap {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AliasMap) : {};
  } catch {
    return {};
  }
}

function writeAliases(aliases: AliasMap): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

/** Remembers that a spoken phrase resolved to a specific class, so future
 * commands skip fuzzy matching — and any ambiguity — for that exact phrase. */
export function rememberClassAlias(spokenName: string, classId: string): void {
  const key = normalize(spokenName);
  if (!key) return;
  const aliases = readAliases();
  if (aliases[key] === classId) return;
  aliases[key] = classId;
  writeAliases(aliases);
}

export function getClassAliases(): AliasMap {
  return readAliases();
}

export function forgetClassAliases(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Renders learned aliases as "phrase → class name" lines, dropping any
 * whose class no longer exists rather than showing a raw, meaningless id. */
export function describeClassAliases(aliases: Record<string, string>, classes: ClassOption[]): string {
  const lines = Object.entries(aliases)
    .map(([phrase, classId]) => {
      const name = classes.find((c) => c.id === classId)?.name;
      return name ? `"${phrase}" → ${name}` : null;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return "I haven't learned any class shortcuts yet.";
  return `Here's what I've learned:\n${lines.join("\n")}`;
}
