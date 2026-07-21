import { SECTOR_LABELS, SECTOR_TAGS } from "./tasksFormat";

export const INBOX_VIEW_NAME = "Inbox";
export function sectorRank(name: string): number {
  const idx = SECTOR_TAGS.findIndex((s) => s.toLowerCase() === name.toLowerCase());
  return idx === -1 ? SECTOR_TAGS.length : idx;
}
export function cleanProjectName(value?: string): string {
  return (value || "").trim().replace(/^>+\s*/, "");
}
export function isReservedInboxProject(value?: string): boolean {
  return cleanProjectName(value).toLowerCase() === "inbox";
}
export function normalizeTaskProject(value?: string): string | undefined {
  const project = cleanProjectName(value);
  if (!project || isReservedInboxProject(project)) {
    return void 0;
  }
  return project;
}
export function projectDisplayName(value?: string): string {
  const normalized = normalizeTaskProject(value);
  if (!normalized) return INBOX_VIEW_NAME;
  return SECTOR_LABELS.get(normalized.toLowerCase()) || normalized;
}
export function uniqueRealProjects(projects: (string | undefined)[]): string[] {
  return [...new Set(projects.map(normalizeTaskProject).filter(Boolean))].sort((a: string, b: string) => sectorRank(a) - sectorRank(b) || a.localeCompare(b));
}
