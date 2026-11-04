import type { Task } from "./types";
import { daysBetweenIso, isIsoDate } from "./dateUtils";
import { normalizeTaskProject } from "./projects";

/**
 * Keeps the "waiting since" record in step with the tasks file: open tasks in
 * the waiting sector get a start date the first time they are seen there, and
 * tasks that left it (or were completed or deleted) are dropped, so moving a
 * task back later starts the clock again.
 *
 * `seedFromCreated` is only true the first time the plugin builds this record:
 * tasks already waiting then start from their ➕ created date instead of today,
 * which is the best guess there is. Returns null when nothing changed.
 */
export function reconcileWaitingSince(
  current: Record<string, string>,
  tasks: Task[],
  waitingTag: string | null,
  today: string,
  seedFromCreated: boolean
): Record<string, string> | null {
  // An empty or unreadable file must not wipe the record.
  if (tasks.length === 0) return null;
  const tag = (waitingTag || "").toLowerCase();
  const next: Record<string, string> = {};
  if (tag) {
    for (const task of tasks) {
      if (task.completed || (normalizeTaskProject(task.project) || "").toLowerCase() !== tag) continue;
      const known = current[task.id];
      if (isIsoDate(known)) {
        next[task.id] = known;
      } else if (seedFromCreated && isIsoDate(task.created) && task.created <= today) {
        next[task.id] = task.created;
      } else {
        next[task.id] = today;
      }
    }
  }
  const before = Object.keys(current);
  const after = Object.keys(next);
  const same = before.length === after.length && after.every((id) => current[id] === next[id]);
  return same ? null : next;
}

/** "Waiting 12 d"; today reads "Waiting since today". */
export function formatWaitingAge(since: string, today: string): string {
  const days = Math.max(0, daysBetweenIso(since, today));
  return days === 0 ? "Waiting since today" : `Waiting ${days} d`;
}

export function waitingDays(since: string, today: string): number {
  return Math.max(0, daysBetweenIso(since, today));
}
