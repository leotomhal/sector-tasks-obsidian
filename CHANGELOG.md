# Changelog

All notable changes to Sector Tasks are documented here. Versions follow the
`manifest.json` version; dates are release dates.

## 1.2.3

### Internal
- Fixed the root cause of the type-safety warnings still reported by Obsidian's review of 1.2.2: `tsconfig.json` declared `lib: ES5/ES6/ES7`, so under the reviewer's environment `padStart`, `Object.entries`, `flatMap`, and `Promise.finally` resolved as error-typed values (locally this was masked by `@types/node` pulling in newer lib definitions). The lib is now `ES2020`, matching the compile target and Obsidian 1.7.2's runtime. No code changes; the bundle is unchanged.
- Replaced the deprecated `builtin-modules` dev dependency with Node's built-in `builtinModules` (from `node:module`) in the esbuild config, per Obsidian's review recommendation. Build output is unchanged.

## 1.2.2

### Internal
- Type-safety cleanup for Obsidian's plugin review: the entire `src/` codebase now uses real TypeScript types (central `Task`/`RepeatRule`/`SectorConfig`/`BelkiSettings`/`ReviewSession` interfaces, typed class fields and method signatures, a typed minimal `TasksApiV1` interface for the Tasks plugin API). This eliminates all ~3,400 advisory `no-unsafe-*`/`no-explicit-any` warnings from the review report; the compiled `main.js` behaves identically.
- Replaced transpiler-artifact `let _a` optional-chaining temps with native optional chaining.

## 1.2.1

### Fixed
- Cleared the blocking error from Obsidian's plugin review: `Workspace.revealLeaf` is only supported since Obsidian 1.7.2, so `minAppVersion` is raised from 1.6.6 to 1.7.2 (revealLeaf is used to open the Today sidebar).

### Internal
- Addressed the actionable lint findings from Obsidian's review: `document.createElement`/`createEl("span")` → `createSpan`/`createDiv` helpers, `var` → `const`/`let`, removed unnecessary regex escapes, added the `u` flag to emoji character classes, and removed an empty catch block.
- Added ESLint (with `eslint-plugin-obsidianmd` + `typescript-eslint`) as a dev dependency and a `lint` script, and wired it into CI so genuine review-blocking issues surface before submission. The remaining type-safety warnings on the intentionally loosely-typed reconstructed code are advisory (non-blocking), matching how Obsidian's review reports them.

## 1.2.0

### New
- **"Open search"** command — opens the board (activating it if needed) and jumps straight to the search overlay. Assign it a hotkey under Obsidian's Settings → Hotkeys.
- **"Search excludes completed tasks"** setting (off by default): when on, completed tasks are hidden from search results everywhere search runs.

### Internal
- Completed Phases 1-4 of the source-based build migration: `main.js` is now generated from real TypeScript source (`src/`) via `tsc` + esbuild, CI runs the build and fails on drift between source and the committed bundle, and releases attest build provenance for the published assets. See prior PRs (#21-24) for details.

## 1.1.1

### Fixed
- Folder creation no longer logs a "Could not create folder. Error: Folder already exists." warning (and no longer aborts file setup) when a parent folder already exists but Obsidian's lookup doesn't immediately see it — the "already exists" case is now treated as success.

## 1.1.0

### New
- **"Clean up completed tasks now"** command — runs the auto-delete cleanup on demand and reports the result, including why nothing was removed (e.g. completed tasks without a `✅` date, which are never deleted).
- **Tasks-file path warning** in settings: a note appears under the "Tasks file" field when the path points to a folder or to a file that doesn't exist yet.

## 1.0.0

First stable release. The Time Sector workflow is complete and the file-writing
core is covered by tests — see the earlier entries for the full feature history.

### Changed
- Added `authorUrl` to the manifest.
- Removed the misleading collapse chevron from the sidebar's "Review" heading.
- The Today sidebar's "Due tomorrow" section can now be collapsed by clicking its header.

## 0.27.0

### Changed
- **Auto-cleanup safety net:** completed tasks removed by the auto-delete cleanup are now appended to an archive note (`<tasks file> (archive).md`) before deletion; if the archive can't be written, nothing is deleted.

### Internal
- Added a test suite (`node --test`) covering the task-line parse/serialize round-trip, recurrence handling, and tag/label helpers, plus a CI workflow that runs it on every push and pull request.

## 0.26.0

### New
- **Open board** button in the Today sidebar header — jump to the full task board without going through the ribbon or command palette.

### Docs
- Added this changelog.

## 0.25.0

### New
- **Due tomorrow** section in the Today sidebar, below Overdue and Due today.
- **Tab badge** on the Today sidebar showing the count of overdue + due-today tasks.
- **Right-click due dates:** right-click any open task row (board or Today sidebar) to set the due date to Today / Tomorrow / Next week or clear it, without opening the Tasks modal.

## 0.24.0

### Changed
- Enlarged the Today sidebar entries by ~10% (font sizes, checkbox, spacing).

## 0.23.0

### Changed
- Removed the "fork of belki" attribution from the manifest author and user-facing strings; the README keeps a "Based on belki" credit. (0.22.1 was rolled into this release.)

## 0.22.0

### New
- **Today sidebar:** the "Open Today sidebar" command opens a compact panel in the right sidebar listing overdue and due-today tasks, with priority-colored complete buttons, click-to-edit, and Inbox quick-add. Updates live with the tasks file.

### Changed
- Grouped all cosmetic settings (fonts, theme colors, sidebar icons, project/label colors) into a collapsible "Appearance" section.
- Removed the unused "Task Description Font" option.

## 0.21.0

### New
- **Auto-delete completed tasks:** optional cleanup that removes completed tasks from the file N days after their completion date (settings, default off).
- **Review reminders:** the Weekly and Monthly Review buttons show a dot until a review of that kind has been completed in the current ISO week / calendar month.

### Removed
- The sector rollover feature from 0.20.0.

## 0.20.0

### New
- **Sector rollover** command (later removed in 0.21.0).

## 0.19.0

### New
- **Quick add task (Inbox)** command for capturing tasks straight into the Inbox via a hotkey, without opening the board.

### Infrastructure
- GitHub Actions workflow to publish releases with `main.js`, `manifest.json`, and `styles.css` attached as assets.
