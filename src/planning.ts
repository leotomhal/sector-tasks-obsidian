import type { Task } from "./types";
import { daysBetweenIso, isIsoDate, shiftIsoDate } from "./dateUtils";

/** First day of a planning entry: 🛫 start for a multi-day entry, else its 📅 date. */
export function entryFirstDay(entry: Task): string {
  return entry.start && isIsoDate(entry.start) ? entry.start : entry.due || "";
}
export function quarterOf(iso: string): number {
  return Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
}
export function entryDays(entry: Task): number {
  if (!entry.start || !entry.due) return 1;
  return Math.max(1, daysBetweenIso(entry.start, entry.due) + 1);
}
/** Last day an entry covers: its 📅 date, or the end of its month/quarter. */
export function entryLastDay(entry: Task): string {
  const due = entry.due || "";
  if (!entry.precision || !isIsoDate(due)) return due;
  const y = Number(due.slice(0, 4));
  const m = Number(due.slice(5, 7));
  const lastMonth = entry.precision === "quarter" ? Math.floor((m - 1) / 3) * 3 + 3 : m;
  const lastDay = new Date(y, lastMonth, 0).getDate();
  return `${y}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
/** Past once its whole period is over (for month/quarter entries, the month/quarter). */
export function isPastEntry(entry: Task, today: string): boolean {
  return Boolean(entry.due) && entryLastDay(entry) < today;
}
/** Only exact-day entries fall on a day; month/quarter entries never do. */
export function isEntryOn(entry: Task, day: string): boolean {
  if (entry.precision) return false;
  return entryFirstDay(entry) <= day && (entry.due || "") >= day;
}
/** A milestone whose date has passed without being checked off. */
export function isMissedMilestone(entry: Task, today: string): boolean {
  return entry.milestone === true && !entry.completed && isPastEntry(entry, today);
}
/** Entries that touch the given year, sorted by first day then last day. */
export function entriesForYear(entries: Task[], year: number): Task[] {
  const y = String(year);
  return entries
    .filter((e) => isIsoDate(e.due) && (e.due.startsWith(y) || entryFirstDay(e).startsWith(y)))
    .sort(compareEntries);
}
/**
 * Entries running today or starting within the next `days` days. Month and
 * quarter entries have no day, so they're left out unless `includePeriods`
 * (then they count while their period isn't over).
 */
export function upcomingEntries(entries: Task[], today: string, days: number, includePeriods = false): Task[] {
  const until = shiftIsoDate(today, days);
  return entries
    .filter((e) => (includePeriods || !e.precision) && isIsoDate(e.due) && entryLastDay(e) >= today && entryFirstDay(e) <= until)
    .sort(compareEntries);
}
function precisionRank(entry: Task): number {
  return entry.precision === "quarter" ? 0 : entry.precision === "month" ? 1 : 2;
}
export function compareEntries(a: Task, b: Task): number {
  return entryFirstDay(a).localeCompare(entryFirstDay(b)) || precisionRank(a) - precisionRank(b) || (a.due || "").localeCompare(b.due || "") || a.title.localeCompare(b.title);
}
