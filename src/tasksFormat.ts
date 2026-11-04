import { dedupeLabels } from "./labels";
import type { RepeatRule, SectorConfig, Task } from "./types";

export const DEFAULT_SECTORS: SectorConfig[] = [
  { tag: "01this-week", label: "This week", inWeekly: true, inMonthly: true },
  { tag: "02next-week", label: "Next week", inWeekly: true, inMonthly: true },
  { tag: "03this-month", label: "This month", inWeekly: true, inMonthly: true },
  { tag: "04next-month", label: "Next month", inWeekly: false, inMonthly: true },
  { tag: "05longterm", label: "Long term", inWeekly: false, inMonthly: true },
  { tag: "routines", label: "Routines", inWeekly: false, inMonthly: false },
  { tag: "waiting", label: "Waiting", isWaiting: true, inWeekly: false, inMonthly: false }
];
export const SECTOR_TAG_PATTERN = /^[A-Za-z0-9_\-/]+$/;
export const INBOX_SECTOR = "Inbox";
export const TASK_MARKER_TAG = "task";
export const PLANNING_TAG = "planning";
export const MILESTONE_TAG = "milestone";
/** Heading the plugin files year-plan entries under, at the end of the tasks file. */
export const PLANNING_HEADING = "## Planning";
export let SECTOR_TAGS = DEFAULT_SECTORS.map((s) => s.tag);
export let SECTOR_SET = new Set(SECTOR_TAGS.map((s) => s.toLowerCase()));
export let SECTOR_LABELS = new Map(DEFAULT_SECTORS.map((s) => [s.tag.toLowerCase(), s.label]));
export function normalizeSectorTag(value?: string): string {
  return (value || "").trim().replace(/^#/, "");
}
export function isReservedSectorTag(lowerTag: string): boolean {
  return lowerTag === TASK_MARKER_TAG || lowerTag === "inbox" || lowerTag === PLANNING_TAG || lowerTag === MILESTONE_TAG;
}
export function normalizeSectors(rawSectors?: SectorConfig[]): SectorConfig[] {
  const source = Array.isArray(rawSectors) && rawSectors.length ? rawSectors : DEFAULT_SECTORS;
  const seen = /* @__PURE__ */ new Set();
  const result: SectorConfig[] = [];
  for (const entry of source) {
    const tag = normalizeSectorTag(entry == null ? void 0 : entry.tag);
    if (!tag || !SECTOR_TAG_PATTERN.test(tag)) continue;
    const lower = tag.toLowerCase();
    if (isReservedSectorTag(lower) || seen.has(lower)) continue;
    seen.add(lower);
    const label = ((entry == null ? void 0 : entry.label) || "").trim() || tag;
    result.push({
      tag,
      label,
      isWaiting: (entry == null ? void 0 : entry.isWaiting) === true,
      inWeekly: (entry == null ? void 0 : entry.inWeekly) === true,
      inMonthly: (entry == null ? void 0 : entry.inMonthly) === true
    });
  }
  return result.length ? result : DEFAULT_SECTORS.map((s) => ({ ...s }));
}
export function applySectorSettings(sectors: SectorConfig[]) {
  const list = sectors && sectors.length ? sectors : DEFAULT_SECTORS;
  SECTOR_TAGS = list.map((s) => s.tag);
  SECTOR_SET = new Set(SECTOR_TAGS.map((s) => s.toLowerCase()));
  SECTOR_LABELS = new Map(list.map((s) => [s.tag.toLowerCase(), s.label || s.tag]));
}
export const PRIORITY_EMOJI_TO_BELKI = [
  ["\u{1F53A}", "P1"],
  ["\u23EB", "P1"],
  ["\u{1F53C}", "P2"],
  ["\u{1F53D}", "P3"],
  ["\u23EC", "P4"]
];
export const BELKI_TO_PRIORITY_EMOJI: Record<string, string> = {
  none: "",
  P1: "\u23EB",
  P2: "\u{1F53C}",
  P3: "\u{1F53D}",
  P4: "\u23EC"
};
export const PRIORITY_EMOJIS = PRIORITY_EMOJI_TO_BELKI.map(([e]) => e);
export const E_DUE = "\u{1F4C5}";
export const E_DONE = "\u2705";
export const E_CREATED = "\u2795";
export const E_RECUR = "\u{1F501}";
export const E_ID = "\u{1F194}";
export const E_SCHEDULED = "\u23F3";
export const E_START = "\u{1F6EB}";
export const E_CANCELLED = "\u274C";
export const ISO = "\\d{4}-\\d{2}-\\d{2}";
export const TASK_LINE = /^(\s*)- \[( |x|X|\/|-)\]\s+(.*)$/;
export function dateAfter(emoji: string, text: string): string | undefined {
  const re = new RegExp(`${emoji}\\s*(${ISO})`);
  const m = text.match(re);
  return m ? m[1] : void 0;
}
export function stripField(emoji: string, text: string): string {
  const re = new RegExp(`\\s*${emoji}\\s*(${ISO})?`, "g");
  return text.replace(re, " ");
}
export const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};
export const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};
export function parseTasksRecurrence(raw: string): RepeatRule | undefined {
  const rawTrimmed = raw.trim();
  const text = rawTrimmed.toLowerCase();
  if (!text.startsWith("every")) return void 0;
  const body = text.slice("every".length).trim();
  const mode = /when done/.test(body) ? "completedDate" : "scheduledDate";
  const ends = "never";
  const intMatch = body.match(/^(\d+)\s+(day|week|weekday|month|year)s?\b/);
  const interval = intMatch ? parseInt(intMatch[1], 10) : 1;
  if (/\bday(s)?\b/.test(body)) {
    return { frequency: "daily", interval, mode, ends, raw: rawTrimmed };
  }
  if (/weekday/.test(body)) {
    return { frequency: "weekdays", interval, mode, ends, raw: rawTrimmed };
  }
  if (/\bweek(s)?\b/.test(body)) {
    const wd = Object.keys(WEEKDAY_INDEX).find((d) => body.includes(d));
    return { frequency: "weekly", interval, mode, ends, weekday: wd ? WEEKDAY_INDEX[wd] : void 0, raw: rawTrimmed };
  }
  if (/\bmonth(s)?\b/.test(body)) {
    const domMatch = body.match(/on the (\d+)/);
    return { frequency: "monthly", interval, mode, ends, dayOfMonth: domMatch ? parseInt(domMatch[1], 10) : void 0, raw: rawTrimmed };
  }
  const yearMonth = Object.keys(MONTH_INDEX).find((m) => body.includes(m));
  if (/\byear(s)?\b/.test(body) || yearMonth) {
    const dMatch = yearMonth ? body.match(/\b(\d{1,2})\b/) : void 0;
    return {
      frequency: "yearly",
      interval,
      mode,
      ends,
      month: yearMonth ? MONTH_INDEX[yearMonth] : void 0,
      dayOfMonth: dMatch ? parseInt(dMatch[1], 10) : void 0,
      raw: rawTrimmed
    };
  }
  return { frequency: "yearly", interval: 1, mode, ends, raw: rawTrimmed };
}
export function serializeTasksRecurrence(rule: RepeatRule): string {
  if (rule.raw && rule.raw.trim()) return rule.raw.trim();
  const i = rule.interval ?? 1;
  const plural = (unit: string) => i === 1 ? unit : `${i} ${unit}s`;
  const when = rule.mode === "completedDate" ? " when done" : "";
  switch (rule.frequency) {
    case "daily":
      return `every ${plural("day")}${when}`.replace("every 1 day", "every day");
    case "weekdays":
      return `every weekday${when}`;
    case "weekly": {
      const wd = rule.weekday !== void 0 ? " on " + ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][rule.weekday] : "";
      const base = i === 1 ? "every week" : `every ${i} weeks`;
      return `${base}${wd}${when}`;
    }
    case "monthly": {
      const dom = rule.dayOfMonth !== void 0 ? ` on the ${ordinal(rule.dayOfMonth)}` : "";
      const base = i === 1 ? "every month" : `every ${i} months`;
      return `${base}${dom}${when}`;
    }
    case "yearly": {
      const base = i === 1 ? "every year" : `every ${i} years`;
      return `${base}${when}`;
    }
  }
}
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`;
}
export function extractTags(text: string): string[] {
  const out: string[] = [];
  const re = /(^|\s)#([A-Za-z0-9_\-/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[2]);
  }
  return out;
}
export function stripTags(text: string, tags: string[]): string {
  let out = text;
  for (const t of tags) {
    out = out.replace(new RegExp(`(^|\\s)#${escapeRe(t)}\\b`, "g"), "$1");
  }
  return out;
}
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function parseTaskLine(line: string, id: string, order: number): { task: Task; indent: number } | null {
  const m = line.match(TASK_LINE);
  if (!m) return null;
  const indent = m[1].length;
  const statusChar = m[2].toLowerCase();
  const completed = statusChar === "x";
  let body = m[3];
  const due = dateAfter(E_DUE, body);
  const completedDate = dateAfter(E_DONE, body);
  const created = dateAfter(E_CREATED, body);
  const scheduled = dateAfter(E_SCHEDULED, body);
  const start = dateAfter(E_START, body);
  const cancelledDate = dateAfter(E_CANCELLED, body);
  let existingId: string | undefined;
  const idMatch = body.match(new RegExp(`${E_ID}\\s*([A-Za-z0-9_-]+)`));
  if (idMatch) existingId = idMatch[1];
  let repeat: RepeatRule | undefined;
  const recurMatch = body.match(new RegExp(`${E_RECUR}\\s*([^\u{1F4C5}\u2705\u2795\u{1F194}\u23F3\u{1F6EB}\u274C\u{1F53A}\u23EB\u{1F53C}\u{1F53D}\u23EC]+)`, "u"));
  if (recurMatch) repeat = parseTasksRecurrence(recurMatch[1]);
  let priority = "none";
  for (const [emoji, p] of PRIORITY_EMOJI_TO_BELKI) {
    if (body.includes(emoji)) {
      priority = p;
      break;
    }
  }
  body = stripField(E_DUE, body);
  body = stripField(E_DONE, body);
  body = stripField(E_CREATED, body);
  body = stripField(E_SCHEDULED, body);
  body = stripField(E_START, body);
  body = stripField(E_CANCELLED, body);
  body = body.replace(new RegExp(`${E_RECUR}\\s*[^\u{1F4C5}\u2705\u2795\u{1F194}\u23F3\u{1F6EB}\u274C\u{1F53A}\u23EB\u{1F53C}\u{1F53D}\u23EC]+`, "gu"), " ");
  body = body.replace(new RegExp(`${E_ID}\\s*[A-Za-z0-9_-]+`, "g"), " ");
  for (const e of PRIORITY_EMOJIS) body = body.split(e).join(" ");
  const tags = extractTags(body);
  const planning = tags.some((t) => t.toLowerCase() === PLANNING_TAG);
  // #milestone only means something on a planning entry; elsewhere it stays a label.
  const milestone = planning && tags.some((t) => t.toLowerCase() === MILESTONE_TAG);
  const sectorTag = planning ? void 0 : tags.find((t) => SECTOR_SET.has(t.toLowerCase()));
  const labelTags = tags.filter((t) => {
    const lower = t.toLowerCase();
    if (lower === TASK_MARKER_TAG || lower === PLANNING_TAG || (milestone && lower === MILESTONE_TAG)) return false;
    return planning || !SECTOR_SET.has(lower);
  });
  body = stripTags(body, tags);
  const title = body.replace(/\s+/g, " ").trim() || "Untitled task";
  const task: Task = {
    id: existingId || id,
    title,
    completed,
    status: statusChar === "/" || statusChar === "-" ? statusChar : void 0,
    completedDate: completed ? completedDate : void 0,
    created,
    scheduled,
    start,
    cancelledDate,
    due,
    deadline: void 0,
    project: sectorTag || void 0,
    // sector stored in belki "project" slot
    priority,
    description: void 0,
    labels: dedupeLabels(labelTags),
    attachments: [],
    repeat,
    completedOccurrences: void 0,
    parentId: void 0,
    extraProperties: [],
    order
  };
  if (planning) task.planning = true;
  if (milestone) task.milestone = true;
  return { task, indent };
}
export function serializeTaskLine(task: Task, indent = 0): string {
  const pad = " ".repeat(indent);
  const box = task.completed ? "[x]" : task.status === "/" || task.status === "-" ? `[${task.status}]` : "[ ]";
  const parts = [task.title.trim()];
  parts.push(`#${TASK_MARKER_TAG}`);
  if (task.planning) {
    parts.push(`#${PLANNING_TAG}`);
    if (task.milestone) parts.push(`#${MILESTONE_TAG}`);
  } else if (task.project && SECTOR_SET.has(task.project.toLowerCase())) {
    parts.push(`#${task.project}`);
  }
  for (const label of dedupeLabels(task.labels)) {
    parts.push(`#${label}`);
  }
  const pe = BELKI_TO_PRIORITY_EMOJI[task.priority];
  if (pe) parts.push(pe);
  if (task.repeat) parts.push(`${E_RECUR} ${serializeTasksRecurrence(task.repeat)}`);
  if (task.created) parts.push(`${E_CREATED} ${task.created}`);
  if (task.start) parts.push(`${E_START} ${task.start}`);
  if (task.scheduled) parts.push(`${E_SCHEDULED} ${task.scheduled}`);
  if (task.due) parts.push(`${E_DUE} ${task.due}`);
  if (task.cancelledDate) parts.push(`${E_CANCELLED} ${task.cancelledDate}`);
  if (task.completed && task.completedDate) parts.push(`${E_DONE} ${task.completedDate}`);
  parts.push(`${E_ID} ${task.id}`);
  return `${pad}- ${box} ${parts.join(" ")}`;
}
export function ensureSectorInLine(line: string, sector?: string): string {
  if (!sector) return line;
  const tag = `#${sector}`;
  if (new RegExp(`(^|\\s)${tag}\\b`, "i").test(line)) return line;
  const markerRe = new RegExp(`(#${TASK_MARKER_TAG})\\b`, "i");
  if (markerRe.test(line)) {
    return line.replace(markerRe, `$1 ${tag}`);
  }
  return `${line} ${tag}`;
}
export function ensureTaskMarker(line: string): string {
  if (new RegExp(`(^|\\s)#${TASK_MARKER_TAG}\\b`, "i").test(line)) return line;
  const boxMatch = line.match(/^(\s*[-*]\s*\[[ xX]\]\s*)(.*)$/);
  if (boxMatch) return `${boxMatch[1]}${boxMatch[2]} #${TASK_MARKER_TAG}`.replace(/\s+#/, " #");
  return `${line} #${TASK_MARKER_TAG}`;
}
export function isTaskLine(line: string): boolean {
  return TASK_LINE.test(line);
}
export function hasTaskMarker(line: string): boolean {
  return new RegExp(`(^|\\s)#${TASK_MARKER_TAG}\\b`, "i").test(line);
}
