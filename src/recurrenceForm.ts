import type { RepeatRule } from "./types";

/** The recurrence part of the task editor, as plain values. */
export interface RecurrenceForm {
  /** "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" */
  frequency: string;
  interval: number;
  /** 0 = Sunday … 6 = Saturday (weekly only). */
  weekday: number;
  /** 1–31 (monthly only). */
  dayOfMonth: number;
  /** Count the next date from the completion day instead of the due date. */
  whenDone: boolean;
}

function weekdayOf(iso?: string): number {
  if (!iso) return new Date().getDay();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
function dayOfMonthOf(iso?: string): number {
  return iso ? Number(iso.slice(8, 10)) : new Date().getDate();
}

/** Fills the form from an existing rule; missing parts default from the due date. */
export function formFromRule(rule: RepeatRule | undefined, due?: string): RecurrenceForm {
  if (!rule) return { frequency: "none", interval: 1, weekday: weekdayOf(due), dayOfMonth: dayOfMonthOf(due), whenDone: false };
  return {
    frequency: rule.frequency,
    interval: Math.max(1, rule.interval ?? 1),
    weekday: rule.weekday ?? weekdayOf(due),
    dayOfMonth: rule.dayOfMonth ?? dayOfMonthOf(due),
    whenDone: rule.mode === "completedDate"
  };
}

/** Builds the rule the form describes; undefined for "Never". */
export function ruleFromForm(form: RecurrenceForm): RepeatRule | undefined {
  if (form.frequency === "none") return void 0;
  const interval = Math.max(1, Math.floor(form.interval || 1));
  const rule: RepeatRule = {
    frequency: form.frequency,
    interval: form.frequency === "weekdays" ? 1 : interval,
    mode: form.whenDone ? "completedDate" : "scheduledDate",
    ends: "never"
  };
  if (form.frequency === "weekly") rule.weekday = form.weekday;
  if (form.frequency === "monthly") rule.dayOfMonth = Math.min(31, Math.max(1, Math.floor(form.dayOfMonth || 1)));
  return rule;
}

/** True when a rule can't be shown exactly in the form (e.g. "every 15 july"), so saving it unchanged matters. */
export function isCustomRule(rule: RepeatRule | undefined): boolean {
  if (!rule) return false;
  return rule.frequency === "yearly" && (rule.month !== void 0 || rule.dayOfMonth !== void 0);
}
