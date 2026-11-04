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
export function isPastEntry(entry: Task, today: string): boolean {
  return Boolean(entry.due) && entry.due < today;
}
export function isEntryOn(entry: Task, day: string): boolean {
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
/** Entries running today or starting within the next `days` days. */
export function upcomingEntries(entries: Task[], today: string, days: number): Task[] {
  const until = shiftIsoDate(today, days);
  return entries
    .filter((e) => isIsoDate(e.due) && e.due >= today && entryFirstDay(e) <= until)
    .sort(compareEntries);
}
export function compareEntries(a: Task, b: Task): number {
  return entryFirstDay(a).localeCompare(entryFirstDay(b)) || (a.due || "").localeCompare(b.due || "") || a.title.localeCompare(b.title);
}
