/**
 * Helpers for "Create note" on a task: turning a task title into a note name
 * and finding the note a title already links to. No Obsidian imports, so the
 * tests can use them directly.
 */

/** Characters Obsidian doesn't allow in file names, plus the ones that break links. */
const INVALID_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
const MAX_NAME_LENGTH = 120;

/** A note name for a task title: invalid characters dropped, spaces collapsed, no trailing dots. */
export function noteNameFromTitle(title: string): string {
  let name = (title || "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(INVALID_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length > MAX_NAME_LENGTH) name = name.slice(0, MAX_NAME_LENGTH).trim();
  return name.replace(/[.\s]+$/, "").replace(/^\.+/, "");
}

/** The note a task title links to with [[…]] (the first one), without heading or alias. */
export function linkedNoteName(title: string): string | undefined {
  const match = /\[\[([^\]|#\n]+?)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/.exec(title || "");
  const target = match?.[1].trim();
  return target ? target : void 0;
}

/**
 * The task title rewritten as a link to the note. Keeps the original wording as
 * the alias when the note name had to drop characters, as long as the wording
 * itself can't break the link.
 */
export function titleAsLink(title: string, noteName: string): string {
  const trimmed = (title || "").trim();
  if (trimmed === noteName || /[[\]|]/.test(trimmed)) return `[[${noteName}]]`;
  return `[[${noteName}|${trimmed}]]`;
}

/** Fills {{title}}, {{date}} and {{tasks}} in a template. */
export function fillNoteTemplate(template: string, values: { title: string; date: string; tasks: string }): string {
  return template
    .replace(/\{\{\s*title\s*\}\}/gi, values.title)
    .replace(/\{\{\s*date\s*\}\}/gi, values.date)
    .replace(/\{\{\s*tasks\s*\}\}/gi, values.tasks);
}
