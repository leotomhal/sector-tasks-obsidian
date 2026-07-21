export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export function todayIso() {
  const now = /* @__PURE__ */ new Date();
  return toIsoDate(now);
}
export function yesterdayIso() {
  const yesterday = /* @__PURE__ */ new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return toIsoDate(yesterday);
}
export function addDaysIso(days) {
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}
export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function currentIsoWeekKey() {
  const now = /* @__PURE__ */ new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  target.setDate(target.getDate() - (target.getDay() + 6) % 7 + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - (firstThursday.getDay() + 6) % 7 + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1e3));
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
export function currentMonthKey() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export function isIsoDate(value) {
  return Boolean(value && ISO_DATE_PATTERN.test(value));
}
export function compareIsoDates(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
export function isBeforeToday(value) {
  return isIsoDate(value) && value < todayIso();
}
export function isToday(value) {
  return isIsoDate(value) && value === todayIso();
}
export function isAfterToday(value) {
  return isIsoDate(value) && value > todayIso();
}
export function formatDueDateChip(value) {
  if (!isIsoDate(value)) return "Date";
  if (value === todayIso()) return "Today";
  if (value === addDaysIso(1)) return "Tomorrow";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const thisYear = (/* @__PURE__ */ new Date()).getFullYear();
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    ...year !== thisYear ? { year: "numeric" } : {}
  }).format(date);
}
