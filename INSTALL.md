# Sector Tasks

A task board that reads/writes **a single** Markdown file in **Tasks plugin format** (emoji syntax). Grouping by **configurable sector tags** — the defaults implement [Carl Pullein's Time Sector System](https://www.carlpullein.com/blog/a-revolutionary-new-time-management-system-designed-for-the-21st-century/1/5/2020) (see the README for a short explanation), but any tag scheme works.

## Requirement
Since version 0.3.0 the community plugin **"Tasks"** is mandatory. Creating and editing tasks runs through Tasks' own input modal (`apiV1.createTaskLineModal` / `editTaskLineModal`). Without the Tasks plugin installed and enabled, these actions do not work; a notice is shown on load.

## Installation
1. In your vault: create the folder `.obsidian/plugins/sektor-tasks/`.
2. Copy `main.js`, `manifest.json`, `styles.css` into it.
3. Restart Obsidian → Settings → Community plugins → enable "Sector Tasks".
4. In the plugin settings, set the **Tasks file** path (default: `Tasks.md`).

## How it works
- Only lines carrying the `#task` tag in the configured file are managed.
- All other lines (headings, prose, unrelated checkboxes) are left untouched.
- Sectors (= "projects" in the UI), default order:
  `#01this-week`, `#02next-week`, `#03this-month`, `#04next-month`, `#05longterm`, `#routines`, `#waiting`.
- **Configurable since v0.5.0:** In the plugin settings under "Sectors", tag text, display name, order, and number of sectors can be adjusted freely. If you change the tag text of an existing sector, already-tagged tasks are renamed automatically in the file (no manual search & replace needed). If you remove a sector, its tasks are kept — the old tag is treated as a regular label instead of a sector column on the next load.
- One sector can be marked as **"Waiting for"** (settings toggle). It always forms the final step of Weekly and Monthly Review with its own actions (Follow up / Keep waiting); the Weekly/Monthly inclusion toggles do not apply to it.
- Every other sector can be included in **Weekly** and/or **Monthly Review** independently via two toggles per sector.
- A task without a sector tag lands in the **Inbox**.
- **Auto-cleanup (since v0.21.0):** the setting "Auto-delete completed tasks" removes completed tasks from the file N days after their completion date (checked once per Obsidian start). 0 disables the cleanup (default). Completed tasks without a `✅` date are never touched.
- **Review reminders (since v0.21.0):** the Weekly and Monthly Review buttons in the sidebar show a small dot as long as no review of that kind has been completed in the current ISO week (Mon–Sun) / calendar month. Finishing the last step of a review clears the dot; the rollover feature from v0.20.0 was removed.
- **Today sidebar (since v0.22.0):** the command **"Open Today sidebar"** opens a compact panel in Obsidian's right sidebar listing overdue, due-today, and (since v0.25.0) due-tomorrow tasks (archived sectors excluded). The circle completes a task (priority-colored), clicking a row opens it in the Tasks edit modal, and the `+` button quick-adds to the Inbox. The panel updates live with every change to the tasks file, and the tab carries a badge with the count of overdue + due-today tasks. Since v0.26.0 the header also has a button that opens the full board.
- **Right-click due dates (since v0.25.0):** right-clicking any open task row (on the board or in the Today sidebar) opens a menu to set the due date to Today / Tomorrow / Next week (+7 days) or remove it — written straight into the line without the Tasks modal. The menu also has an "Edit in Tasks modal…" entry for the full editor.
- **Settings layout (since v0.22.0):** all cosmetic options (fonts, theme colors, sidebar icons, project/label colors) live in a collapsed "Appearance" group at the bottom of the settings tab. The unused "Task Description Font" option was removed.
- Additional `#tags` (other than `#task` and the sector tags) are preserved on the line and written back. You assign labels directly in the task title or in the Tasks modal.
- Every task row on the board has a **jump button** (visible on mouseover): it opens the underlying note and places the cursor on the matching `🆔` line.
- **Multi-select:** Ctrl/Cmd+click selects multiple task rows (highlighted blue). Dragging one of them by the drag handle moves the whole selection together (sector, due date, or onto the Inbox). A plain click without Ctrl/Cmd clears the selection.
- **Remove sector (Inbox):** drag the task onto the Inbox button in the sidebar, or delete the sector tag manually in the Tasks modal.

## Creating and editing tasks
- **Create:** Clicking "+ Add task" opens the Tasks input modal. The currently selected sector is inserted automatically as a tag on the new line. Without an active sector, the task lands in the Inbox.
- **Edit:** Clicking a task opens the same line in the Tasks modal. After saving, the file is updated; the sector tag is preserved.
- Due date, priority, and recurrence are managed entirely by the Tasks modal — including free-text recurrences like `every 15 july`, which are therefore guaranteed to stay Tasks-compatible.

## Reviews
Three guided walkthroughs, all resumable after interruptions:
- **Weekly Review:** Inbox → all sectors with the Weekly toggle enabled (in settings order) → Waiting sector.
- **Monthly Review:** Inbox → sectors with the Monthly toggle enabled (monthly-only sectors first, then those shared with Weekly) → Waiting sector.
- **Daily Review:** Inbox → due today → due tomorrow or overdue. Date-based, no sector logic.
- **PROCESS** button in the Inbox: runs the review workflow for the Inbox only.

### Review hotkeys (desktop)
| Key | Action |
|---|---|
| `K` | Move task up one sector |
| `J` | Move task down one sector |
| `I` | Move task to Inbox |
| `N` | Next — leave task unchanged |
| `F` | Follow up (Waiting step) |
| `W` | Keep waiting (Waiting step) |
| `R` | Reschedule (Daily Review) |
| `D` | Mark done |
| `X` | Delete (press twice to confirm) |
| `1`–`9` | Inbox step only: assign task directly to the corresponding sector (order as configured; the current mapping is shown inside the review) |

The buttons show their hotkey as a framed letter. On mobile, the Inbox step shows one button per sector instead of the number hotkeys.

## Field mapping (official Tasks emoji syntax)
| Property | Syntax |
|---|---|
| Due date | `📅 2026-07-01` |
| Done | `[x] … ✅ 2026-07-01` |
| Created | `➕ 2026-06-29` |
| Recurrence | `🔁 every week` |
| Priority | `⏫` (high = P1) `🔼` (P2) `🔽` (P3) `⏬` (P4); `🔺` is read as P1 |
| Stable ID | `🆔 …` (set automatically, used for completing/recurrence) |

## Recurrence (free-text, Tasks style)
You enter recurrences in the Tasks modal using its free-text syntax:
- Examples: `every day`, `every 2 weeks on monday`, `every month on the 5`, `every 15 july`, `every week when done`.
- The text is written to the line **unchanged** (`🔁 …`) — the Tasks plugin itself computes the next due date from it.
- **Note:** This plugin's internal scheduler only knows regular patterns (daily/weekly/monthly/yearly) when completing a task. Date-exact yearly rules like `every 15 july` are recognized correctly since v0.4.2 (month + day are parsed and targeted exactly on completion, even if the current due date deviates from the target month/day).

## Important notes
- **`🆔` is appended:** On first write, every managed line gets an ID. This is valid Tasks syntax, but it visibly changes your lines.
- **Not supported** (removed by design): descriptions, attachments, sub-tasks, deadlines. Only `due`, priority, recurrence, and sector are managed.
- **Back up the file before first use.** The plugin writes directly into your real note.

## Example line
```
- [ ] How do we prepare the CCE launch in January? #task #01this-week ⏫ 📅 2026-07-15
```
