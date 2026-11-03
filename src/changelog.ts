import changelogMarkdown from "../CHANGELOG.md";

export interface ReleaseNotes {
  version: string;
  body: string;
}

const VERSION_HEADING = /^## (\d+\.\d+\.\d+)\s*$/;

/** Splits CHANGELOG.md into one entry per "## x.y.z" heading, in file order (newest first). */
export function parseChangelog(markdown: string): ReleaseNotes[] {
  const entries: ReleaseNotes[] = [];
  let current: { version: string; lines: string[] } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = VERSION_HEADING.exec(line);
    if (match) {
      if (current) entries.push({ version: current.version, body: current.lines.join("\n").trim() });
      current = { version: match[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push({ version: current.version, body: current.lines.join("\n").trim() });
  return entries;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The entries to show after updating from lastSeen to current: every version
 * after lastSeen up to and including current, newest first. Without a
 * lastSeen (the version before this feature existed), only current's entry.
 */
export function releaseNotesSince(entries: ReleaseNotes[], lastSeen: string, current: string): ReleaseNotes[] {
  const picked = lastSeen
    ? entries.filter((e) => compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0)
    : entries.filter((e) => e.version === current);
  return picked.sort((a, b) => compareVersions(b.version, a.version));
}

export function bundledReleaseNotes(): ReleaseNotes[] {
  return parseChangelog(changelogMarkdown);
}
