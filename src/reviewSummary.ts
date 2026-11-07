import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type { BelkiSettings, ReviewSession, ReviewSnapshotEntry, SectorConfig, Task } from "./types";
import { currentIsoWeekKey, currentMonthKey, daysBetweenIso, isIsoDate, todayIso } from "./dateUtils";
import { normalizeTaskProject } from "./projects";
import { findWaitingSector } from "./review";
import { stuckWeeks } from "./stale";
import type { SectorStay } from "./stale";

export interface ReviewSummaryInput {
  type: string;
  /** "2026-W45" for weekly, "2026-11" for monthly. */
  periodKey: string;
  today: string;
  tasks: Task[];
  sectors: SectorConfig[];
  snapshot: Record<string, ReviewSnapshotEntry>;
  waitingSince: Record<string, string>;
  /** Optional: to list tasks still stuck in their sector after the review. */
  sectorSince?: Record<string, SectorStay>;
  stuckThresholdWeeks?: number;
}

export function reviewNoteTitle(type: string, periodKey: string): string {
  return `${type === "monthly" ? "Monthly" : "Weekly"} review ${periodKey}`;
}

/**
 * The summary note's Markdown. Plain bullets on purpose: "- [x]" lines would
 * show up in Tasks-plugin queries, and the note should only describe tasks.
 */
export function buildReviewSummary(input: ReviewSummaryInput): string {
  const { type, periodKey, today, tasks, sectors, snapshot, waitingSince } = input;
  const windowDays = type === "monthly" ? 30 : 7;
  const windowStart = shiftDays(today, -(windowDays - 1));
  const labels = new Map(sectors.map((s) => [s.tag.toLowerCase(), s.label]));
  const sectorName = (tag: string) => (tag ? labels.get(tag.toLowerCase()) || `#${tag}` : "Inbox");
  const sectorOf = (task: Task) => normalizeTaskProject(task.project) || "";
  const open = tasks.filter((t) => !t.completed);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const done = tasks
    .filter((t) => t.completed && isIsoDate(t.completedDate) && t.completedDate >= windowStart && t.completedDate <= today)
    .sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
  const moved: string[] = [];
  const deleted: string[] = [];
  for (const [id, before] of Object.entries(snapshot)) {
    const task = byId.get(id);
    if (!task) {
      deleted.push(before.title);
      continue;
    }
    if (task.completed) continue;
    const now = sectorOf(task);
    if (now.toLowerCase() !== before.sector.toLowerCase()) {
      moved.push(`${task.title}: ${sectorName(before.sector)} → ${sectorName(now)}`);
    }
  }
  const added = tasks.filter((t) => isIsoDate(t.created) && t.created >= windowStart && t.created <= today);
  const waitingSector = findWaitingSector(sectors);
  const waiting = waitingSector
    ? open.filter((t) => sectorOf(t).toLowerCase() === waitingSector.tag.toLowerCase())
      .map((t) => ({ task: t, days: waitingSince[t.id] ? Math.max(0, daysBetweenIso(waitingSince[t.id], today)) : null }))
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
    : [];

  const lines: string[] = [
    "---",
    `type: ${type}-review`,
    `date: ${today}`,
    `period: ${periodKey}`,
    "---",
    `# ${reviewNoteTitle(type, periodKey)}`,
    "",
    `${open.length} open task${open.length === 1 ? "" : "s"} after the review. "Recent" below means the last ${windowDays} days.`,
    ""
  ];
  const section = (title: string, items: string[], empty: string) => {
    lines.push(`## ${title} (${items.length})`);
    lines.push(...(items.length ? items.map((item) => `- ${item}`) : [empty]), "");
  };
  section("Done recently", done.map((t) => `${t.title} · ${sectorName(sectorOf(t))}`), "Nothing completed.");
  section("Moved during the review", moved, "Nothing moved.");
  if (deleted.length) section("Deleted during the review", deleted, "");
  const stuck = open
    .map((t) => ({ task: t, weeks: stuckWeeks(t, input.sectorSince?.[t.id], sectors, today, input.stuckThresholdWeeks ?? 0) }))
    .filter((s) => s.weeks > 0)
    .sort((a, b) => b.weeks - a.weeks);
  if (stuck.length) section("Stuck", stuck.map(({ task, weeks }) => `${task.title} \u00b7 ${weeks} weeks in ${sectorName(sectorOf(task))}`), "");
  section("New recently", added.map((t) => `${t.title} · ${sectorName(sectorOf(t))}${t.completed ? " (done)" : ""}`), "Nothing new.");
  if (waitingSector) {
    section(
      waitingSector.label,
      waiting.map(({ task, days }) => `${task.title}${days === null ? "" : ` · waiting ${days} day${days === 1 ? "" : "s"}`}`),
      "Nothing to wait for."
    );
  }
  lines.push("## Open per sector", "", "| Sector | Open | Overdue |", "| --- | ---: | ---: |");
  for (const tag of ["", ...sectors.map((s) => s.tag)]) {
    const inSector = open.filter((t) => sectorOf(t).toLowerCase() === tag.toLowerCase());
    const overdue = inSector.filter((t) => isIsoDate(t.due) && t.due < today).length;
    lines.push(`| ${sectorName(tag)} | ${inSector.length} | ${overdue} |`);
  }
  return lines.join("\n") + "\n";
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Where each open task stands now; taken when a weekly or monthly review starts. */
export function snapshotForReview(tasks: Task[]): Record<string, ReviewSnapshotEntry> {
  const snapshot: Record<string, ReviewSnapshotEntry> = {};
  for (const task of tasks) {
    if (!task.completed) snapshot[task.id] = { sector: normalizeTaskProject(task.project) || "", title: task.title };
  }
  return snapshot;
}

/** Writes the note for a finished review and offers to open it. Never throws. */
export async function writeReviewSummaryNote(app: App, settings: BelkiSettings, session: ReviewSession, tasks: Task[]) {
  if (session.type !== "weekly" && session.type !== "monthly") return;
  const periodKey = session.type === "monthly" ? currentMonthKey() : currentIsoWeekKey();
  const markdown = buildReviewSummary({
    type: session.type,
    periodKey,
    today: todayIso(),
    tasks,
    sectors: settings.sectors,
    snapshot: session.startSnapshot || {},
    waitingSince: settings.waitingSince,
    sectorSince: settings.sectorSince,
    stuckThresholdWeeks: settings.stuckWeeks
  });
  try {
    const folder = normalizePath(settings.reviewNotesFolder || "Reviews");
    if (!(app.vault.getFolderByPath(folder) instanceof TFolder)) {
      await app.vault.createFolder(folder);
    }
    const base = `${folder}/${reviewNoteTitle(session.type, periodKey)}`;
    let path = normalizePath(`${base}.md`);
    // A second review in the same week gets its own note instead of overwriting.
    for (let n = 2; app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${base} (${n}).md`);
    const file = await app.vault.create(path, markdown);
    showOpenNotice(app, file);
  } catch (error) {
    console.error("[belki] Could not write the review summary note.", error);
    new Notice("Could not write the review summary note. Check the review notes folder in the plugin settings.");
  }
}

function showOpenNotice(app: App, file: TFile) {
  let notice: Notice | null = null;
  const fragment = createFragment((el) => {
    el.appendText("Review summary saved. ");
    const link = el.createEl("a", { cls: "belki-notice-undo", text: "Open note" });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      notice?.hide();
      void app.workspace.getLeaf(true).openFile(file);
    });
  });
  notice = new Notice(fragment, 8e3);
}
