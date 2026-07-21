# Roadmap

An informal backlog of ideas that have come up but aren't built yet. Nothing
here is committed — it's a place to not lose good ideas. Shipped work lives in
the [changelog](./CHANGELOG.md).

## Under consideration (small)

- **Refine Search** - Add Possibility to create hotkey for search; limit search to undone tasks.    
- **"Overdue → today" bulk action** — one command to reschedule all overdue
  tasks to today, for the daily-planning "pull everything forward" move.
- **Completed statistics** — a small line in the Completed view, e.g.
  "12 done this week · 34 this month", computed from the existing `✅` dates.
- **Tab-badge fallback** — the Today sidebar tab badge uses an internal
  Obsidian API (`leaf.tabHeaderEl`); fall back to the tab title ("Today (3)")
  if that ever breaks. Only worth doing if the badge misbehaves.
- **Refresh screenshots** — the `img/*.png` in the README could be updated to
  show the current UI (Today sidebar, grouped settings). Author task, since it
  needs a real vault.

## In progress

- **Source-based build (fixes Obsidian's security-scan disclosures)** —
  today the repo ships a hand-maintained `main.js` bundle with no source or
  lockfile, so Obsidian's plugin scanner can't run build verification, malware
  scanning, or artifact attestation on releases. Plan: reconstruct the
  TypeScript source under `src/` from the bundle's existing module comments,
  add an esbuild + tsc build, and switch the release workflow to build from
  source and attest the output. Phase 1 (this entry): build tooling
  (`package.json` devDependencies, `tsconfig.json`, `esbuild.config.mjs`,
  `package-lock.json`) is in place; `src/` reconstruction, CI build, and
  attestations follow in later phases before the next release.

## Parked (larger)

- **Vault-wide inline tasks** — read tasks carrying the Tasks-plugin tag from
  anywhere in the vault, not only the single configured file. Big change: the
  whole store is built around one file (full-file rewrite on save, identity via
  appended `🆔`). Open design decisions if revisited:
  - read-only aggregation vs. in-place per-line editing across notes;
  - whether to avoid writing `🆔` into other notes (identify by file + line);
  - new tasks / Inbox likely still land in the configured file (vault is only an
    extra *read* source);
  - tag taken from the Tasks plugin's global filter (fallback `#task`).
- **Time tracker** — either a lightweight focus/Pomodoro timer in the Today
  sidebar (no persistence), or per-task time tracking. The latter needs a
  storage decision: keep totals in the plugin's own `data.json` (task lines stay
  Tasks-compatible) rather than writing non-standard fields into the note.

## Out of scope (by design)

The plugin deliberately delegates these to the Tasks plugin or the note itself,
to stay a lean view over Tasks-compatible lines:

- Task descriptions, attachments, sub-tasks, and deadlines on the board.
- A second, parallel task data format — Sector Tasks only reads/writes
  Tasks-compatible Markdown.
