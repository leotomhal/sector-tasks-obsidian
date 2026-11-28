import type { RepeatRule } from "./types";
import { toIsoDate } from "./dateUtils";

export function nextOccurrence(rule: RepeatRule, fromDate: string): string {
  const [year, month, day] = fromDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const interval = rule.interval ?? 1;
  switch (rule.frequency) {
    case "daily":
      date.setDate(date.getDate() + interval);
      break;
    case "weekly":
      if (rule.weekday === void 0) {
        date.setDate(date.getDate() + 7 * interval);
        break;
      }
      // The next such weekday after the date (not "a week later, then
      // forward"), so a moved date or a "when done" rule doesn't skip a week.
      date.setDate(date.getDate() + 1);
      while (date.getDay() !== rule.weekday) date.setDate(date.getDate() + 1);
      date.setDate(date.getDate() + 7 * (interval - 1));
      break;
    case "weekdays":
      date.setDate(date.getDate() + 1);
      while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
      }
      break;
    case "monthly": {
      // "on the 31st" stays on the 31st (or the month's last day), instead of
      // drifting to the 28th after February.
      const targetDay = rule.dayOfMonth ?? date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + interval);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(targetDay, lastDay));
      break;
    }
    case "yearly": {
      const targetMonth = rule.month !== void 0 ? rule.month - 1 : date.getMonth();
      const targetDay2 = rule.dayOfMonth !== void 0 ? rule.dayOfMonth : date.getDate();
      const targetYear = date.getFullYear() + interval;
      const lastDay2 = new Date(targetYear, targetMonth + 1, 0).getDate();
      // Set day 1 first so a 31st can't spill into the following month.
      date.setDate(1);
      date.setFullYear(targetYear, targetMonth, Math.min(targetDay2, lastDay2));
      break;
    }
  }
  return toIsoDate(date);
}
export function isRepeatEnded(rule: RepeatRule, occurrenceCount: number, nextDate: string): boolean {
  if (rule.ends === "never") return false;
  if (rule.ends === "onDate" && rule.endsDate) {
    return nextDate > rule.endsDate;
  }
  if (rule.ends === "afterOccurrences" && rule.endsCount !== void 0) {
    return occurrenceCount >= rule.endsCount;
  }
  return false;
}
