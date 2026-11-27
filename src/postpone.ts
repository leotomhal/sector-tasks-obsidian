import type { Task } from "./types";

/**
 * Whether a change moves a task's due date later: snoozing, "Due: tomorrow",
 * rescheduling in a review, dragging to a later day. A recurring task moving
 * on after it's checked off isn't a postponement, and neither is adding a
 * first date or removing it.
 */
export function isPostponement(task: Task, patch: Partial<Task>): boolean {
  if (task.planning || task.completed) return false;
  if (!("due" in patch) || "completedOccurrences" in patch || patch.completed) return false;
  return Boolean(task.due && patch.due && patch.due > task.due);
}

/** Drops counts for tasks that are gone or done, so the record doesn't grow forever. */
export function prunePostponeCounts(counts: Record<string, number>, tasks: Task[]): Record<string, number> | null {
  // An empty or unreadable file must not wipe the record.
  if (tasks.length === 0) return null;
  const open = new Set(tasks.filter((t) => !t.completed).map((t) => t.id));
  const next: Record<string, number> = {};
  for (const [id, count] of Object.entries(counts)) if (open.has(id) && count > 0) next[id] = count;
  return Object.keys(next).length === Object.keys(counts).length ? null : next;
}

/** Whether the weekly intention is still current: set within the last 14 days. */
export function intentionIsCurrent(setOn: string | undefined, today: string): boolean {
  if (!setOn) return false;
  const [y1, m1, d1] = setOn.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  return days >= 0 && days < 14;
}
