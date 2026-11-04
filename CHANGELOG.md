# Changelog

All notable changes to Sector Tasks are documented here. Versions follow the
`manifest.json` version; dates are release dates.

## 1.5.1

### New
- **Planning entries with only a month or a quarter.** When there's no exact day yet, choose "Sometime in April" or "Sometime in Q2" in the editor or in the year plan's **+ Add** form. In the file these are tagged `#planning/month` or `#planning/quarter`, with the period's first day as the 📅 date. The year plan shows them at the top of their month (with the month instead of a day number) or in an "Any time in Q2" group at the top of the quarter. They count as past only once the whole month or quarter is over, and they stay out of the day-based strips on Today and Upcoming.

## 1.5.0

### New
- **The Tasks plugin is no longer needed.** Sector Tasks now has its own editor for adding and editing tasks: title, sector, priority, due date (with Today / Tomorrow / Next week buttons), labels (with suggestions from the ones you already use) and repeat (every day, weekday, week on a chosen day, month on a chosen day, or year; every N; optionally counted from when it's done). It shows the exact `🔁` text it writes. A repeat rule you wrote earlier, like `every 15 july`, stays exactly as it is unless you change it. `Cmd/Ctrl+Enter` saves. Your file keeps the same Tasks emoji format, so you can keep the Tasks plugin installed or remove it.
- **Year plan:** appointments and milestones as lines in your tasks file, tagged `#planning` (add `#milestone` for milestones). A new **Year plan** view in the sidebar shows the four quarters side by side with the months inside; past entries turn grey, and a milestone still open after its date says **Not reached**. Add an entry right in its quarter, and click one to edit it, jump to its line, or delete it. Multi-day entries use a start date: `🛫 2026-09-16 📅 2026-09-17`.
- Planning entries never show up as tasks. **Today** and **Upcoming** show them in a small strip above your tasks, and the **Overview** lists the next ones.
- New planning entries are kept together under a `## Planning` heading at the end of your tasks file, sorted by date. Once a year is over, its entries move to the archive note (Settings → Archive past years' planning, on by default); the year plan still shows them, read-only.

### Fixed
- Monthly repeat rules are written as "on the 1st", "on the 2nd" instead of "on the 1th".

## 1.4.0

### New
- **Snooze:** right-click a task and snooze it by 1, 3 or 7 days. Each entry shows the date the task moves to. It counts from the due date if that's still ahead, otherwise from today, so an overdue task never lands in the past again.
- **Waiting age:** tasks in your Waiting sector show how long they've been waiting ("Waiting 12 d"), on the board and in the review. After 7 days the count turns red as a nudge to follow up; change or turn off the threshold under Settings → Sectors. The date lives in the plugin's data, not in your tasks file. Tasks that were already waiting start from their ➕ created date.
- **Quick capture:** the Inbox (and the Overview's Inbox tab) has a text field. Type a task, press Enter, done — no dialog. `#labels`, a `#sector` tag, priority emojis and `📅` dates in the text work as usual.
- **Review summary note** (optional, off by default): after a weekly or monthly review, a note in your `Reviews` folder lists what you finished, what moved or was deleted during the review, what's new, who you're waiting on and for how long, and open/overdue tasks per sector. Turn it on under Settings → Write a review summary note.
- **Sectors settings page:** the sector list moved from the main settings to its own "Sectors" page (a collapsible group on Obsidian before 1.13). Renaming a sector's tag or removing a sector now asks first and tells you how many tasks are affected.

### Fixed
- **Scheduled, start and cancelled dates are no longer lost.** Whenever the plugin saved, it rewrote every task line and dropped `⏳` scheduled, `🛫` start and `❌` cancelled dates, and turned `[/]` (in progress) and `[-]` (cancelled) back into open tasks — even on lines you never touched. These are now kept. Completing a recurring task moves `⏳`/`🛫` along with the due date.
- **Task row buttons on phones:** the jump and delete buttons overlapped the card's edge and looked mismatched. They're now two flat icons side by side with room to tap.
- **Today header:** the section shows "Tuesday, 4 Nov" instead of repeating "Today", and the task count isn't shown twice.

### Internal
- `getFileByPath`/`getFolderByPath` where only one kind of file is needed; tsconfig ready for TypeScript 7 (`moduleResolution: bundler`, no `baseUrl`).

## 1.3.14

### New
- **Release notes in Obsidian:** after the plugin updates, this "What's new" dialog shows what changed — including every version you skipped. It doesn't appear on a fresh install, you can turn it off under Settings → Show release notes after updates, and the **Show release notes** command opens it again any time.

## 1.3.13

### New
- **Editorial style:** a new Appearance → Theme → Style option (default unchanged). Serif page titles with a short line above them, sections as cards with a header tinted in the sector's color, dates and labels as pills (overdue red, today warm), and the Overview's rings and counters as tiles with the sector tabs as a segmented bar. It brings its own warm light and dark palette when the color scheme follows Obsidian; a fixed or custom scheme keeps its colors.

### Fixed
- **Deleting a task now asks first.** The × on a task row used to delete the line immediately, with no way back. It now opens a "Delete task?" dialog, and after deleting, a notice with **Undo** restores the task at the same place in the file — under the same heading even if the file changed in between. Deleting from the review walkthrough's X hotkey gets the same Undo.

## 1.3.12

### New
- **Start view:** choose which view the board opens on — Overview, Today, Inbox, or Upcoming (Settings → Start view; default Today). New board tabs start there, and the ribbon icon, the Open command, and the Today sidebar's board button return to it.

### Fixed
- **"Open search" after a restart:** when the board tab had been restored at startup but not shown yet, the command focused the board without opening search. The Today sidebar's board button had the same problem.
- **Settings synced from another device** (e.g. via Obsidian Sync) are now picked up. Previously the plugin kept its old settings in memory and the next save on this device overwrote the synced ones — a review in progress, renamed sectors, colors.

### Internal
- Type checks and lint now run against the Obsidian 1.14.4 API and the current plugin-review rules.

## 1.3.11

### Internal
- Cleared the remaining finding from Obsidian's plugin review: the settings tab no longer calls the deprecated `display()` from plugin code. The fallback settings tab for Obsidian < 1.13 is unchanged and `minAppVersion` stays 1.7.2.

## 1.3.10

### Fixed
- **Faster board with large task files:** rendering the board no longer re-reads and copies every task once per visible row. A leftover sub-task counter did this on every row without ever showing anything (sub-tasks aren't supported), and the drag-target check did the same in the Upcoming view. With 1,000 tasks this saved roughly 290 ms on every re-render — i.e. on every check-off, drag, or edit.

### Internal
- CI and release builds run on Node 22 (Node 20 is end-of-life).
- Resolved the three high-severity `npm audit` advisories in the lint tooling. None of them ever shipped in the plugin, which has no runtime dependencies.
- README feature list and roadmap brought up to date with 1.3.4–1.3.9.

## 1.3.9

### New
- **Overview:** a new sidebar entry adds a landing dashboard — two progress rings (Today, and whichever sector tab is selected below it), Overdue/Done today/Done this week counters, a sector tab bar (Inbox first, then sectors in settings order), and a quick-add + mini task list scoped to the selected tab. Built around sectors rather than due dates, since sector is the plugin's actual organizing concept.

## 1.3.8

### New
- **Single-line task rows:** a new Appearance → Layout → Task rows setting (default "Stacked", the unchanged existing layout) offers "Single line" — title, due date, labels, and the project chip on one row instead of a title line with a meta line below it, for a noticeably shorter list. The description isn't shown in this mode (a full description doesn't fit one line without turning into unreadable fragments); the title truncates with an ellipsis instead of wrapping.

## 1.3.7

### New
- **Combine sectors into one view:** Ctrl/Cmd+click a sector in the sidebar to add it to the current view instead of replacing it — see everything from "This Week" and "Next Week" together, sorted and grouped as usual, each task still carrying its sector chip. A plain click still switches to just that one sector.

### Fixed
- The plugin version in `manifest.json` had drifted out of sync with the published 1.3.6 tag/release (still said 1.3.5). Corrected here.

## 1.3.6

### New
- **Completed-view stats:** two numbers at the top of the Completed view show how many tasks were finished today and this ISO week, counted from the existing `✅` dates (recurring tasks included, counted once per completion event).

### Internal
- Fixed the release workflow's notes fallback (`gh release edit` has no `--generate-notes` flag) and bumped the workflow actions to their current majors.

## 1.3.5

### New
- **Undo after checking a task off:** completing a task now shows a short notice with an inline "Undo" that restores the state from before — completed flag, completion date, due date, repeat rule and recorded occurrences. This covers recurring tasks too, where completing silently reschedules the task to its next due date. Also available as the **"Undo last completed task"** command, so it can get a hotkey; it works from the board, the Today sidebar, and the review walkthrough's `D` action.

### Docs
- The README no longer hardcodes the version number (it had gone stale twice, since release commits don't touch it) and links to the releases page instead.
- Backfilled the missing 1.3.3 changelog entry.
- `package-lock.json` now tracks the released version.

## 1.3.4

### New
- **Combined right-click menu:** right-clicking a task row (board or Today sidebar) now opens one menu with due date (Today/Tomorrow/Next week/Remove) and priority (P1-P4/No priority) together, instead of two separate menus split across the row and the checkbox.

### Fixed
- **Priority now visible on open board tasks:** the board's task checkbox only showed its priority color once a task was checked off; it now shows it while open too, matching the Today sidebar checkbox. Priority is visible directly in the sector columns, not only via the priority sort/group mode.

## 1.3.3

### New
- **Right-click priority menu:** right-clicking a task's checkbox (board or Today sidebar) opened a menu to set P1-P4 or clear the priority, without going through the Tasks modal. Superseded in 1.3.4, which merged it into the row's context menu.

### Docs
- Fixed the README's "Current version" line, which was still showing 1.2.1.
- Trimmed two backlog ideas from the roadmap that are no longer wanted: the "overdue → today" bulk action and the focus-timer/Pomodoro idea.

## 1.3.2

### Changed
- **Search results:** completed tasks (shown when the "search excludes completed tasks" setting is off) now sort after active matches, appear italic and greyed, and carry a "Completed" badge in the result meta row.

## 1.3.1

### Fixed
- Restored support for Obsidian 1.7.2: `minAppVersion` is back to 1.7.2. Obsidian 1.13+ keeps the new declarative settings tab (settings search, drag-and-drop sectors); older versions get the previous imperative settings tab as a fallback. Version 1.3.0 itself remains marked as requiring 1.13.0 in `versions.json`, since it shipped without that fallback.

## 1.3.0

### New
- Settings migrated to Obsidian's declarative settings API (`getSettingDefinitions()`): all Sector Tasks settings now appear in Obsidian's settings search (Obsidian 1.13+), sectors can be reordered by drag-and-drop and deleted directly from the list, and Appearance (fonts, theme colors, icons, project/label colors) is a proper sub-page instead of a collapsible section.
- The tasks-file path and icon-name fields now validate input inline instead of silently falling back.

### Changed
- `minAppVersion` raised from 1.7.2 to 1.13.0 — required for the declarative settings API. Users on older Obsidian versions keep their installed plugin version but won't receive this update until they update Obsidian.
- Adding a sector now creates a placeholder entry (`#new-sector`) to edit in place, replacing the separate add-sector form.

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
