# Sector Tasks

An Obsidian task board in the style of [belki](https://github.com/Fevol/belki), but reading and writing **a single Markdown file** in **Tasks-plugin format** (emoji syntax). Grouping follows **configurable sector tags** — designed for [Carl Pullein](https://www.carlpullein.com/)'s Time Sector System, but usable with any tag scheme.

> Fork of belki (Yasin Aribuga) — the custom composer, custom detail view, and custom repeat modal were removed in favor of the official Tasks plugin modal.

![Board overview](./screenshots/overview.png)

## The Time Sector System

The default sector setup implements the [Time Sector System](https://www.carlpullein.com/blog/a-revolutionary-new-time-management-system-designed-for-the-21st-century/1/5/2020) by productivity coach [Carl Pullein](https://www.carlpullein.com/). Its core idea: instead of organizing tasks by project, you organize them by **when** you will do them — this week, next week, this month, next month, or long term. Processing a new task then requires only one decision. Weekly and monthly planning sessions move tasks up between sectors; routines and waiting-for items live in their own sectors. The system builds on Pullein's **COD workflow** (Collect, Organise, Do): capture everything quickly, organise by time sector, then focus on doing this week's list. Pullein explains both in depth on [his YouTube channel](https://www.youtube.com/@Carl_Pullein) and in his [Time Sector course](https://carl-pullein.thinkific.com/courses/the-time-sector-course).

This plugin doesn't enforce any of that: sectors are just configurable tags, and you can name, order, and review them however you like.

## Why

Classic kanban task plugins manage their own data format. But if you already use the **Tasks** plugin, you want a single source of truth in the file — not a second, parallel task syntax. Sector Tasks only reads/writes Tasks-compatible lines and delegates creating/editing to Tasks' own input modal. The board itself is pure view + sorting, not its own task engine.

## Features

- Board view grouped by sectors (default: `#01this-week` → `#02next-week` → `#03this-month` → `#04next-month` → `#05longterm` → `#routines` → `#waiting`), plus an **Inbox** for tasks without a sector tag
- Sectors are fully configurable: tag text, display name, order, and count can all be adjusted, including automatic migration of already-tagged tasks when renaming; one sector can be marked **Waiting for** (its own review handling instead of up/down logic)
- Each sector can be independently included in **Weekly** and/or **Monthly Review** — no fixed positional assumption about which sectors belong where

![Today view](./screenshots/today.jpg)

- **Weekly/Monthly Review**: a guided, sector-by-sector walkthrough (Inbox → configured sectors → Waiting), with Stay/Up/Down/Inbox per task, or Follow up/Keep waiting for Waiting-tagged tasks; progress persists across interruptions
- **Daily Review**: a shorter, date-based walkthrough (Inbox → due today → due tomorrow or overdue), with Reschedule/Next per task instead of sector logic
- **PROCESS button** in the Inbox: runs the review workflow for the Inbox only

![Inbox with PROCESS button](./screenshots/inbox.jpg)
![Review mode](./screenshots/review.jpg)
![Editing a task during review](./screenshots/review-edittasksj.jpg)

- Creating & editing tasks exclusively through the native Tasks modal (`apiV1.createTaskLineModal` / `editTaskLineModal`) — full compatibility with Tasks free-text syntax, including recurrences like `every 15 july`
- Only lines tagged `#task` are managed; everything else in the file is left untouched
- Jump button per task: opens the underlying note at the matching `🆔` line
- Additional `#tags` on the line are preserved
- Sort modes: smart, due date, priority, deadline, created, project
- Multi-select (Ctrl/Cmd+click) with shared drag-and-drop (sector, due date, Inbox)
- **Review hotkeys** (desktop): `K` move up, `J` move down, `I` to Inbox, `N` next/leave unchanged, `F` follow up, `W` keep waiting, `R` reschedule, `D` done, `X` delete (press twice to confirm). In the Inbox step, `1`–`9` assign the task directly to the corresponding sector (order as configured in settings; the current mapping is shown inside the review). On mobile, the Inbox step shows one button per sector instead.
- Full-text search across all tasks
- **Theme**: follow the active Obsidian theme, use a fixed light/dark palette, or customize every color individually

![Sector settings, including Weekly/Monthly review toggles](./screenshots/review-sectors.jpg)

## Requirements

The community plugin **Tasks** must be installed and enabled.

## Installation

See [INSTALL.md](./INSTALL.md) for step-by-step setup, the field-mapping table, and notes on recurrence rules.

## Not supported (by design)

Descriptions, attachments, sub-tasks, deadlines on the board — the plugin stays lean and delegates anything beyond sector, due date, priority, and recurrence to Tasks itself or to the note.

## Status

Current version: **0.18.0** — see [manifest.json](./manifest.json).

## Development transparency

This plugin was developed in close collaboration with an AI assistant (Claude). All code is AI-generated; direction, feature decisions, testing, and bug reports are human. Review the code before trusting it with your notes — as you should with any plugin.

## License

MIT, see [licence.md](./licence.md). Based on [belki](https://github.com/Fevol/belki) by Yasin Aribuga (also MIT).
