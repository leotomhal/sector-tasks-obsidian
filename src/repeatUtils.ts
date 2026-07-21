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
      date.setDate(date.getDate() + 7 * interval);
      if (rule.weekday !== void 0 && date.getDay() !== rule.weekday) {
        let diff = rule.weekday - date.getDay();
        if (diff < 0) diff += 7;
        date.setDate(date.getDate() + diff);
      }
      break;
    case "weekdays":
      date.setDate(date.getDate() + 1);
      while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
      }
      break;
    case "monthly": {
      const targetDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + interval);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(targetDay, lastDay));
      break;
    }
    case "yearly": {
      const targetMonth = rule.month !== void 0 ? rule.month - 1 : date.getMonth();
      const targetDay2 = rule.dayOfMonth !== void 0 ? rule.dayOfMonth : date.getDate();
      date.setFullYear(date.getFullYear() + interval);
      const lastDay2 = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
      date.setMonth(targetMonth);
      date.setDate(Math.min(targetDay2, lastDay2));
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
