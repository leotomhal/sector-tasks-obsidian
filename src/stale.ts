import type { SectorConfig, Task } from "./types";
import { daysBetweenIso, isIsoDate } from "./dateUtils";
import { normalizeTaskProject } from "./projects";

/** When a task entered the sector it is in now. */
export interface SectorStay {
  sector: string;
  since: string;
}

/**
 * Keeps the "in this sector since" record in step with the tasks file. A task
 * seen in a new sector (or for the first time) starts at today; one that left
 * its sector restarts; completed tasks and tasks without a sector are dropped.
 * Existing tasks start at today on first run: there is no reliable earlier date.
 * Returns null when nothing changed.
 */
export function reconcileSectorSince(current: Record<string, SectorStay>, tasks: Task[], today: string): Record<string, SectorStay> | null {
  // An empty or unreadable file must not wipe the record.
  if (tasks.length === 0) return null;
  const next: Record<string, SectorStay> = {};
  for (const task of tasks) {
    const sector = normalizeTaskProject(task.project);
    if (task.completed || !sector) continue;
    const known = current[task.id];
    next[task.id] = known && known.sector.toLowerCase() === sector.toLowerCase() && isIsoDate(known.since)
      ? known
      : { sector, since: today };
  }
  const before = Object.keys(current);
  const after = Object.keys(next);
  const same = before.length === after.length && after.every((id) => current[id] === next[id]);
  return same ? null : next;
}

/**
 * Whole weeks a task has been stuck in its sector, or 0 when it doesn't count:
 * only sectors in the weekly review (not the waiting sector), no recurring
 * tasks, and only from `thresholdWeeks` on (0 turns it off).
 */
export function stuckWeeks(task: Task, stay: SectorStay | undefined, sectors: SectorConfig[], today: string, thresholdWeeks: number): number {
  if (!stay || thresholdWeeks <= 0 || task.completed || task.repeat) return 0;
  const sector = normalizeTaskProject(task.project);
  if (!sector || sector.toLowerCase() !== stay.sector.toLowerCase()) return 0;
  const config = sectors.find((s) => s.tag.toLowerCase() === sector.toLowerCase());
  if (!config || !config.inWeekly || config.isWaiting) return 0;
  const weeks = Math.floor(Math.max(0, daysBetweenIso(stay.since, today)) / 7);
  return weeks >= thresholdWeeks ? weeks : 0;
}
