export type ClassOption = { id: string; name: string };

export type AnalyticsQuestion = "overview" | "low-attendance" | "warnings";

export type ClassIntent =
  | "open-class"
  | "scan"
  | "gradebook"
  | "attendance"
  | "start-session"
  | "end-session"
  | "analytics-overview"
  | "analytics-low-attendance"
  | "analytics-warnings";

type ResolvedFrom = { spokenName: string; classId: string };

export type VoiceCommand =
  | { type: "navigate"; path: string; label: string; resolvedFrom?: ResolvedFrom }
  | { type: "start-session"; classId: string; className: string; resolvedFrom?: ResolvedFrom }
  | { type: "end-session"; classId: string; className: string; resolvedFrom?: ResolvedFrom }
  | {
      type: "analytics";
      question: AnalyticsQuestion;
      classId?: string;
      className?: string;
      resolvedFrom?: ResolvedFrom;
    }
  | { type: "needs-class"; label: string }
  | { type: "class-not-found"; spokenName: string }
  | { type: "class-ambiguous"; spokenName: string; matches: ClassOption[]; intent: ClassIntent }
  | { type: "reset-memory" }
  | { type: "memory-summary" }
  | { type: "unrecognized"; transcript: string };

type VoiceContext = {
  classes: ClassOption[];
  currentClassId?: string | null;
  /** Normalized spoken phrase -> classId, learned from past disambiguations. */
  aliases?: Record<string, string>;
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves a spoken class name against the known class list — exact match first,
 * then substring, then word overlap — so minor mis-transcriptions still land. */
export function matchClass(spokenName: string, classes: ClassOption[]): ClassOption[] {
  const needle = normalize(spokenName);
  if (!needle) return [];

  const exact = classes.filter((c) => normalize(c.name) === needle);
  if (exact.length > 0) return exact;

  const contains = classes.filter((c) => {
    const name = normalize(c.name);
    return name.includes(needle) || needle.includes(name);
  });
  if (contains.length > 0) return contains;

  const needleWords = needle.split(" ").filter(Boolean);
  return classes.filter((c) => {
    const nameWords = normalize(c.name).split(" ").filter(Boolean);
    return needleWords.some((w) => nameWords.includes(w));
  });
}

const INTENT_META: Record<ClassIntent, { label: string; pathFor?: (classId: string) => string }> = {
  "open-class": { label: "Class", pathFor: (id) => `/dashboard/classes/${id}` },
  scan: { label: "Scanner", pathFor: (id) => `/scan/${id}` },
  gradebook: { label: "Gradebook", pathFor: (id) => `/gradebook/${id}` },
  attendance: { label: "Attendance", pathFor: (id) => `/attendance/${id}` },
  "start-session": { label: "start a session" },
  "end-session": { label: "end the session" },
  "analytics-overview": { label: "check analytics for" },
  "analytics-low-attendance": { label: "check who's below attendance for" },
  "analytics-warnings": { label: "check warnings for" },
};

type ResolvableCommand = Extract<VoiceCommand, { type: "navigate" | "start-session" | "end-session" | "analytics" }>;

function buildCommand(intent: ClassIntent, classId: string, className: string): ResolvableCommand {
  if (intent === "start-session" || intent === "end-session") {
    return intent === "start-session"
      ? { type: "start-session", classId, className }
      : { type: "end-session", classId, className };
  }
  if (intent.startsWith("analytics-")) {
    const question = intent.slice("analytics-".length) as AnalyticsQuestion;
    return { type: "analytics", question, classId, className };
  }
  const meta = INTENT_META[intent];
  return { type: "navigate", path: meta.pathFor!(classId), label: `${meta.label} for ${className}` };
}

/** Builds the command for a class the user (or a remembered alias) has already
 * picked — used both for a clean spoken match and for resolving a disambiguation click. */
export function resolveClassChoice(
  intent: ClassIntent,
  spokenName: string,
  classId: string,
  classes: ClassOption[],
): VoiceCommand {
  const className = classes.find((c) => c.id === classId)?.name ?? "this class";
  return { ...buildCommand(intent, classId, className), resolvedFrom: { spokenName, classId } };
}

function resolveClassIntent(spokenName: string | null, context: VoiceContext, intent: ClassIntent): VoiceCommand {
  if (spokenName) {
    const aliasId = context.aliases?.[normalize(spokenName)];
    if (aliasId && context.classes.some((c) => c.id === aliasId)) {
      return resolveClassChoice(intent, spokenName, aliasId, context.classes);
    }

    const matches = matchClass(spokenName, context.classes);
    if (matches.length === 0) return { type: "class-not-found", spokenName };
    if (matches.length > 1) return { type: "class-ambiguous", spokenName, matches, intent };
    return resolveClassChoice(intent, spokenName, matches[0].id, context.classes);
  }

  if (context.currentClassId) {
    const current = context.classes.find((c) => c.id === context.currentClassId);
    return buildCommand(intent, context.currentClassId, current?.name ?? "this class");
  }

  return { type: "needs-class", label: INTENT_META[intent].label };
}

/** Like resolveClassIntent, but an unresolved class isn't an error — it just
 * means "answer across every class" instead of one specific class. */
function resolveAnalyticsIntent(
  spokenName: string | null,
  context: VoiceContext,
  question: AnalyticsQuestion,
): VoiceCommand {
  const intent = `analytics-${question}` as ClassIntent;

  if (spokenName) {
    const aliasId = context.aliases?.[normalize(spokenName)];
    if (aliasId && context.classes.some((c) => c.id === aliasId)) {
      return resolveClassChoice(intent, spokenName, aliasId, context.classes);
    }

    const matches = matchClass(spokenName, context.classes);
    if (matches.length === 0) return { type: "class-not-found", spokenName };
    if (matches.length > 1) return { type: "class-ambiguous", spokenName, matches, intent };
    return resolveClassChoice(intent, spokenName, matches[0].id, context.classes);
  }

  if (context.currentClassId) {
    const current = context.classes.find((c) => c.id === context.currentClassId);
    return { type: "analytics", question, classId: context.currentClassId, className: current?.name };
  }

  return { type: "analytics", question };
}

function extractClassName(t: string): string | null {
  const patterns = [/\bfor (.+)$/, /\bin (.+)$/, /\bclass (.+)$/];
  for (const pattern of patterns) {
    const m = t.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
}

// Analytics questions are natural-language ("how's this class doing?") and
// legitimately contain the word "class" on their own — extractClassName's
// generic "class X" pattern (meant for "open class X") would misfire and
// capture a trailing word like "doing" as if it were a class name. Only the
// unambiguous "for X" phrasing is safe to treat as a named class here.
function extractAnalyticsClassName(t: string): string | null {
  const m = t.match(/\bfor (.+)$/);
  return m ? m[1].trim() : null;
}

function stripLeadingVerb(t: string): string | null {
  const m = t.match(/^(?:open|go to|show me|show)\s+(?:the\s+)?(.+)$/);
  return m ? m[1].trim() : null;
}

const STATIC_ROUTES: { path: string; label: string; pattern: RegExp }[] = [
  { path: "/dashboard", label: "Dashboard", pattern: /\b(dashboard|home)\b/ },
  { path: "/schedule", label: "Schedule", pattern: /\bschedule\b/ },
  { path: "/students", label: "Students", pattern: /\bstudents?\b/ },
  { path: "/attendance", label: "Attendance", pattern: /\battendance\b/ },
  { path: "/profile", label: "Profile", pattern: /\bprofile\b/ },
];

const WAKE_WORD_PATTERN = /^(?:hey |ok )?jarvis[, ]*/;

const ANALYTICS_PATTERNS: { question: AnalyticsQuestion; pattern: RegExp }[] = [
  {
    question: "low-attendance",
    pattern: /\b(at risk|below attendance|low attendance|missing attendance|who.?s (missing|behind|absent))\b/,
  },
  { question: "warnings", pattern: /\b(warnings?|any issues|any problems|anything wrong|flags?)\b/ },
  {
    question: "overview",
    pattern: /\b(analytics|insights|overview|summary|attendance rate|average attendance|how.?s .*(doing|going))\b/,
  },
];

export function parseVoiceCommand(rawTranscript: string, context: VoiceContext): VoiceCommand {
  const transcript = rawTranscript.trim();
  const t = normalize(transcript).replace(WAKE_WORD_PATTERN, "").replace(/^please /, "").trim();
  if (!t) return { type: "unrecognized", transcript };

  if (/\bforget everything\b/.test(t) || /\bclear (?:your )?memory\b/.test(t) || /\breset jarvis\b/.test(t)) {
    return { type: "reset-memory" };
  }

  if (/\bwhat (have you|do you) (learned|remember)\b/.test(t) || /\blist.*(shortcuts|aliases)\b/.test(t)) {
    return { type: "memory-summary" };
  }

  for (const { question, pattern } of ANALYTICS_PATTERNS) {
    if (pattern.test(t)) {
      return resolveAnalyticsIntent(extractAnalyticsClassName(t), context, question);
    }
  }

  if (/\bsession\b/.test(t)) {
    const isEnd = /\b(end|close|stop)\b/.test(t);
    return resolveClassIntent(extractClassName(t), context, isEnd ? "end-session" : "start-session");
  }

  if (/\bscan\b/.test(t)) {
    return resolveClassIntent(extractClassName(t), context, "scan");
  }

  if (/\b(gradebook|grades)\b/.test(t)) {
    return resolveClassIntent(extractClassName(t), context, "gradebook");
  }

  for (const route of STATIC_ROUTES) {
    if (!route.pattern.test(t)) continue;
    if (route.path === "/attendance") {
      const spokenName = extractClassName(t);
      if (spokenName) {
        return resolveClassIntent(spokenName, context, "attendance");
      }
    }
    return { type: "navigate", path: route.path, label: route.label };
  }

  if (/\b(class|open|go to|show)\b/.test(t)) {
    const spokenName = extractClassName(t) ?? stripLeadingVerb(t);
    if (spokenName) {
      return resolveClassIntent(spokenName, context, "open-class");
    }
  }

  return { type: "unrecognized", transcript };
}
