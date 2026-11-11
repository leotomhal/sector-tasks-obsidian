import { App, Modal, setIcon } from "obsidian";
import type { CalendarFeed, Task, TimeBlock } from "../types";
import { eventsOnDay, formatMinutes } from "../calendar";
import type { CalEvent } from "../calendar";
import { entryFirstDay, isEntryOn } from "../planning";

/** One line of the day plan / agenda: a calendar event or a planning entry. */
export interface AgendaItem {
  /** Sort key: "<day>|<0 all-day,1 timed,2 planning>|<minutes>|title". */
  key: string;
  when: string;
  title: string;
  source: string;
  color?: string;
  milestone?: boolean;
  past?: boolean;
  now?: boolean;
  onClick: () => void;
}

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", options).format(new Date(y, m - 1, d));
};
const shortDay = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
const plainTitle = (title: string) => title.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias?: string) => alias || target);

/** Calendar events of `days` as agenda items; `nowMin` marks running/past events on the first day. */
export function calendarItems(
  events: CalEvent[],
  days: string[],
  feeds: Map<string, CalendarFeed>,
  nowMin: number | null,
  withDate: boolean,
  open: (event: CalEvent) => void
): AgendaItem[] {
  const items: AgendaItem[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    for (const piece of eventsOnDay(events, day)) {
      // A multi-day all-day event shows once, on the first listed day.
      if (piece.allDay && seen.has(piece.event.id)) continue;
      seen.add(piece.event.id);
      const feed = feeds.get(piece.event.feedId);
      const time = piece.allDay ? "All day" : `${formatMinutes(piece.startMin)}–${formatMinutes(piece.endMin)}`;
      const isFirstDay = day === days[0];
      items.push({
        key: `${day}|${piece.allDay ? 0 : 1}|${String(piece.startMin).padStart(4, "0")}|${piece.event.title}`,
        when: withDate ? `${shortDay(day)} · ${time}` : time,
        title: piece.event.title,
        source: feed?.name || "Calendar",
        color: feed?.color,
        past: isFirstDay && nowMin !== null && !piece.allDay && piece.endMin <= nowMin,
        now: isFirstDay && nowMin !== null && !piece.allDay && piece.startMin <= nowMin && nowMin < piece.endMin,
        onClick: () => open(piece.event)
      });
    }
  }
  return items;
}

/** Planning entries as agenda items, dated relative to `today`. */
export function planningItems(entries: Task[], today: string, open: (entry: Task) => void): AgendaItem[] {
  return entries.map((entry) => {
    const first = entryFirstDay(entry);
    const running = isEntryOn(entry, today);
    const day = running ? today : first;
    return {
      key: `${day}|${running ? 0 : 2}|0000|${entry.title}`,
      when: running ? "Today" : shortDay(first),
      title: plainTitle(entry.title),
      source: entry.milestone ? "Milestone" : "Planning",
      milestone: true,
      onClick: () => open(entry)
    };
  });
}

/** The day plan (Today) or agenda (Upcoming): one card, items sorted by day and time. */
export function renderAgenda(parent: HTMLElement, heading: string, note: string, items: AgendaItem[], more?: { label: string; onClick: () => void }) {
  if (!items.length) return;
  const card = parent.createDiv({ cls: "belki-planning-strip belki-agenda" });
  const head = card.createDiv({ cls: "belki-planning-strip-head" });
  head.createSpan({ text: heading });
  if (note) head.createSpan({ cls: "belki-agenda-note", text: note });
  if (more) {
    const button = head.createEl("button", { cls: "belki-planning-strip-more", text: more.label, attr: { type: "button" } });
    button.addEventListener("click", more.onClick);
  }
  for (const item of [...items].sort((a, b) => a.key.localeCompare(b.key))) {
    const row = card.createEl("button", { cls: "belki-planning-strip-row belki-agenda-row", attr: { type: "button" } });
    row.toggleClass("is-past", item.past === true);
    row.toggleClass("is-now", item.now === true);
    row.createSpan({ cls: "belki-planning-strip-when", text: item.when });
    if (item.color) {
      row.createSpan({ cls: "belki-agenda-dot" }).setCssStyles({ backgroundColor: item.color });
    } else {
      row.createSpan({ cls: "belki-year-diamond" });
    }
    const title = row.createSpan({ cls: "belki-planning-strip-title", text: item.title });
    title.createSpan({ cls: "belki-agenda-source", text: item.source });
    row.addEventListener("click", item.onClick);
  }
}

/** Read-only details of a calendar event. */
export class EventModal extends Modal {
  event: CalEvent;
  feed?: CalendarFeed;
  constructor(app: App, event: CalEvent, feed?: CalendarFeed) {
    super(app);
    this.event = event;
    this.feed = feed;
  }
  onOpen() {
    const { contentEl, event, feed } = this;
    contentEl.empty();
    contentEl.addClass("belki-event-modal");
    this.setTitle(event.title);
    contentEl.createEl("p", { cls: "belki-planning-modal-kind", text: `${feed?.name || "Calendar"} · read-only` });
    const list = contentEl.createEl("dl", { cls: "belki-event-details" });
    const add = (label: string, value?: string) => {
      if (!value) return;
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    };
    const long: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    let when = event.startDay === event.endDay ? fmt(event.startDay, long) : `${fmt(event.startDay, { weekday: "long", day: "numeric", month: "long" })} to ${fmt(event.endDay, long)}`;
    if (!event.allDay && event.startMs !== void 0 && event.endMs !== void 0) {
      const time = (ms: number) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
      when += `, ${time(event.startMs)}–${time(event.endMs)}`;
    }
    add("When", when);
    add("Where", event.location);
    add("Notes", event.description);
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    if (feed && /(^|\.)google\.com$/i.test(hostOf(feed.url))) {
      const [y, m, d] = event.startDay.split("-");
      const link = actions.createEl("a", { cls: "belki-event-link", text: "Open in your calendar", href: `https://calendar.google.com/calendar/r/day/${y}/${Number(m)}/${Number(d)}` });
      link.setAttr("target", "_blank");
      link.setAttr("rel", "noopener");
    }
    const close = actions.createEl("button", { cls: "mod-cta", text: "Close", attr: { type: "button" } });
    close.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/^webcal:\/\//i, "https://")).hostname;
  } catch {
    return "";
  }
}

/** What the timeline needs from the board. */
export interface TimelineHost {
  app: App;
  dayStartHour: number;
  dayEndHour: number;
  blocks: TimeBlock[];
  /** Task picked for tap-to-place (mobile), or null. */
  picked: string | null;
  taskTitle(taskId: string): string | null;
  taskDone(taskId: string): boolean;
  placeBlock(taskId: string, start: number): void;
  setDuration(taskId: string, duration: number): void;
  removeBlock(taskId: string): void;
  /** Task currently being dragged on the board, if any. */
  draggedTaskId(): string | null;
  openEvent(event: CalEvent): void;
  /** The color of the calendar an event comes from. */
  eventColor(event: CalEvent): string | undefined;
}

const PX_PER_MIN = 1.1;

export function blockConflicts(block: TimeBlock, events: CalEvent[], day: string): boolean {
  return eventsOnDay(events, day).some((p) => !p.allDay && block.start < p.endMin && p.startMin < block.start + block.duration);
}

/** Today's timeline: calendar events as fixed blocks, planned tasks as dashed blocks, a "now" line. */
export function renderTimeline(parent: HTMLElement, host: TimelineHost, events: CalEvent[], day: string, nowMin: number) {
  const start = Math.min(host.dayStartHour, 23) * 60;
  const end = Math.max(start + 60, Math.min(host.dayEndHour, 24) * 60);
  const card = parent.createDiv({ cls: "belki-timeline" });
  const head = card.createDiv({ cls: "belki-planning-strip-head" });
  head.createSpan({ text: "Time blocks" });
  head.createSpan({ cls: "belki-agenda-note", text: host.picked ? "Tap a time to place it" : `${host.blocks.length} planned` });
  const grid = card.createDiv({ cls: "belki-timeline-grid" });
  grid.setCssStyles({ height: `${(end - start) * PX_PER_MIN}px` });
  const top = (min: number) => `${(min - start) * PX_PER_MIN}px`;
  for (let m = start; m < end; m += 30) {
    const slot = grid.createDiv({ cls: "belki-timeline-slot", attr: { "data-start": String(m), role: "button", tabindex: "-1", "aria-label": `Plan at ${formatMinutes(m)}` } });
    slot.toggleClass("is-half", m % 60 !== 0);
    slot.setCssStyles({ top: top(m), height: `${30 * PX_PER_MIN}px` });
    if (m % 60 === 0) grid.createDiv({ cls: "belki-timeline-hour", text: formatMinutes(m) }).setCssStyles({ top: top(m) });
    slot.addEventListener("click", () => {
      if (host.picked) host.placeBlock(host.picked, m);
    });
    slot.addEventListener("dragover", (event) => {
      if (!host.draggedTaskId()) return;
      event.preventDefault();
      slot.addClass("is-drop");
    });
    slot.addEventListener("dragleave", () => slot.removeClass("is-drop"));
    slot.addEventListener("drop", (event) => {
      const id = host.draggedTaskId();
      slot.removeClass("is-drop");
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      host.placeBlock(id, m);
    });
  }
  const timed = eventsOnDay(events, day).filter((p) => !p.allDay && p.endMin > start && p.startMin < end);
  const hasEvents = timed.length > 0;
  for (const piece of timed) {
    const s = Math.max(start, piece.startMin);
    const e = Math.min(end, Math.max(piece.endMin, piece.startMin + 15));
    const item = grid.createEl("button", { cls: "belki-timeline-item belki-timeline-event", attr: { type: "button" } });
    item.setCssStyles({ top: `${(s - start) * PX_PER_MIN + 1}px`, height: `${(e - s) * PX_PER_MIN - 2}px` });
    const color = host.eventColor(piece.event);
    if (color) item.setCssProps({ "--belki-event-color": color });
    item.setText(piece.event.title);
    item.createEl("small", { text: `${formatMinutes(piece.startMin)}–${formatMinutes(piece.endMin)}` });
    item.addEventListener("click", () => host.openEvent(piece.event));
  }
  for (const block of host.blocks) {
    const title = host.taskTitle(block.taskId);
    if (!title) continue;
    const s = Math.max(start, block.start);
    const e = Math.min(end, block.start + block.duration);
    if (e <= s) continue;
    const conflict = blockConflicts(block, events, day);
    const item = grid.createEl("button", { cls: "belki-timeline-item belki-timeline-block", attr: { type: "button" } });
    item.toggleClass("has-events", hasEvents);
    item.toggleClass("is-conflict", conflict);
    item.toggleClass("is-done", host.taskDone(block.taskId));
    item.setCssStyles({ top: `${(s - start) * PX_PER_MIN + 1}px`, height: `${(e - s) * PX_PER_MIN - 2}px` });
    item.setText(title);
    item.createEl("small", { text: `${formatMinutes(block.start)}–${formatMinutes(block.start + block.duration)}${conflict ? " · overlaps" : ""}` });
    item.addEventListener("click", () => new BlockModal(host, block, title).open());
  }
  if (nowMin >= start && nowMin <= end) grid.createDiv({ cls: "belki-timeline-now", attr: { "aria-label": `Now ${formatMinutes(nowMin)}` } }).setCssStyles({ top: top(nowMin) });
}

class BlockModal extends Modal {
  host: TimelineHost;
  block: TimeBlock;
  title: string;
  constructor(host: TimelineHost, block: TimeBlock, title: string) {
    super(host.app);
    this.host = host;
    this.block = block;
    this.title = title;
  }
  onOpen() {
    const { contentEl, block, host } = this;
    contentEl.empty();
    this.setTitle(this.title);
    contentEl.createEl("p", { cls: "belki-planning-modal-kind", text: `Time block · today only · starts ${formatMinutes(block.start)}` });
    const lengths = contentEl.createDiv({ cls: "belki-block-lengths" });
    for (const minutes of [30, 60, 90, 120]) {
      const button = lengths.createEl("button", { text: minutes < 60 ? `${minutes} min` : `${minutes / 60} h`, attr: { type: "button" } });
      button.toggleClass("mod-cta", block.duration === minutes);
      button.addEventListener("click", () => {
        this.close();
        host.setDuration(block.taskId, minutes);
      });
    }
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const remove = actions.createEl("button", { cls: "mod-warning", text: "Remove block", attr: { type: "button" } });
    remove.addEventListener("click", () => {
      this.close();
      host.removeBlock(block.taskId);
    });
    const done = actions.createEl("button", { text: "Close", attr: { type: "button" } });
    done.addEventListener("click", () => this.close());
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** The chip on a task row: "10:30–11:30". */
export function renderBlockChip(parent: HTMLElement, block: TimeBlock | undefined) {
  if (!block) return;
  const chip = parent.createSpan({ cls: "belki-task-block" });
  setIcon(chip.createSpan({ cls: "belki-chip-icon" }), "clock");
  chip.createSpan({ text: `${formatMinutes(block.start)}–${formatMinutes(block.start + block.duration)}` });
}
