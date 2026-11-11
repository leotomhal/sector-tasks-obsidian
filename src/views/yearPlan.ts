import { App, Modal, Notice, setIcon } from "obsidian";
import type { BelkiSettings, Task } from "../types";
import type { TaskStore } from "../taskStore";
import { isIsoDate, todayIso } from "../dateUtils";
import { entriesForYear, entryDays, entryFirstDay, isEntryOn, isMissedMilestone, isPastEntry, quarterOf } from "../planning";
import { ConfirmModal } from "./ConfirmModal";
import type { CalEvent } from "../calendar";

/** What the year plan needs from the board view; avoids importing the view class here. */
export interface PlanningHost {
  app: App;
  store: TaskStore;
  settings: BelkiSettings;
  render(): void;
  renderEyebrow(parent: HTMLElement): void;
  openTaskInNote(task: Task): Promise<void>;
  renderLinkedTitle(text: string, el: HTMLElement): void;
  /** Calendar events from feeds shown in the year plan, as read-only cards. */
  calendarEntries(): Task[];
  openEvent(event: CalEvent): void;
}

/** View state for the year plan; lives on the board view across re-renders. */
export class YearPlanState {
  year = new Date().getFullYear();
  showPast = true;
  addQuarter: number | null = null;
  /** Entries read from the archive note; null until loaded. */
  archived: Task[] | null = null;
  loadingArchive = false;
  /** Quarters the user opened or closed, keyed "2026-Q1"; others follow the default. */
  collapsed = new Map<string, boolean>();
  /** Past quarters start collapsed; the current and upcoming ones start open. */
  isCollapsed(year: number, quarter: number, today: string): boolean {
    const stored = this.collapsed.get(`${year}-Q${quarter}`);
    if (stored !== void 0) return stored;
    const currentYear = Number(today.slice(0, 4));
    return year < currentYear || (year === currentYear && quarter < quarterOf(today));
  }
}

const MONTHS = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(2026, m, 1)));

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmt(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", options).format(parseIso(iso));
}
export function formatEntryWhen(entry: Task): string {
  if (entry.precision === "month") return `Sometime in ${fmt(entry.due, { month: "long", year: "numeric" })}`;
  if (entry.precision === "quarter") {
    const q = quarterOf(entry.due);
    return `Sometime in Q${q} ${entry.due.slice(0, 4)} (${MONTHS[(q - 1) * 3]} \u2013 ${MONTHS[(q - 1) * 3 + 2]})`;
  }
  const long: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
  if (!entry.start || entry.start === entry.due) return fmt(entry.due, long);
  return `${fmt(entry.start, { weekday: "long", day: "numeric", month: "long" })} to ${fmt(entry.due, long)}`;
}

export function renderYearPlan(host: PlanningHost, state: YearPlanState, main: HTMLElement) {
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const isPastYear = state.year < currentYear;
  if (isPastYear && state.archived === null && !state.loadingArchive) {
    state.loadingArchive = true;
    void host.store.readArchivedPlanning().then((entries) => {
      state.archived = entries;
      state.loadingArchive = false;
      host.render();
    });
  }
  const fromFile = host.store.getPlanningEntries();
  const fileIds = new Set(fromFile.map((e) => e.id));
  const archived = (state.archived || []).filter((e) => !fileIds.has(e.id));
  const archivedIds = new Set(archived.map((e) => e.id));
  let entries = entriesForYear([...fromFile, ...archived, ...host.calendarEntries()], state.year);
  if (!state.showPast) entries = entries.filter((e) => !isPastEntry(e, today));

  const header = main.createDiv({ cls: "belki-main-header" });
  const titleWrap = header.createDiv();
  host.renderEyebrow(titleWrap);
  titleWrap.createEl("h1", { text: "Year plan" });
  const tools = header.createDiv({ cls: "belki-year-tools" });
  const picker = tools.createDiv({ cls: "belki-year-picker" });
  const prev = picker.createEl("button", { attr: { type: "button", "aria-label": "Previous year" } });
  setIcon(prev, "chevron-left");
  picker.createSpan({ cls: "belki-year-picker-year", text: String(state.year) });
  const next = picker.createEl("button", { attr: { type: "button", "aria-label": "Next year" } });
  setIcon(next, "chevron-right");
  const step = (delta: number) => {
    state.year += delta;
    state.addQuarter = null;
    host.render();
  };
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  const pastToggle = tools.createEl("label", { cls: "belki-year-past-toggle" });
  const pastInput = pastToggle.createEl("input", { attr: { type: "checkbox" } });
  pastInput.checked = state.showPast;
  pastToggle.appendText("Show past");
  pastInput.addEventListener("change", () => {
    state.showPast = pastInput.checked;
    host.render();
  });

  if (isPastYear) {
    main.createDiv({
      cls: "belki-year-archive-note",
      text: state.loadingArchive
        ? "Loading the archive…"
        : `${state.year} is over. Entries already moved to the archive note are shown read-only.`
    });
  }

  const wrap = main.createDiv({ cls: "belki-year" });
  const grid = wrap.createDiv({ cls: "belki-year-grid" });
  const currentQuarter = state.year === currentYear ? quarterOf(today) : 0;
  // A quarter being added to stays open.
  const collapsedQuarters = [1, 2, 3, 4].map((q) => state.addQuarter !== q && state.isCollapsed(state.year, q, today));
  const openCount = collapsedQuarters.filter((c) => !c).length;
  // With both folded and open quarters, the folded ones stack in a narrow first
  // column on wide screens and the open ones share the rest. On one column the
  // stack takes the place of its first quarter, so the usual case (past
  // quarters folded) still reads Q1–Q4 top to bottom.
  const stack = openCount > 0 && openCount < 4 ? grid.createDiv({ cls: "belki-year-stack" }) : null;
  if (stack) {
    grid.addClass("has-stack");
    grid.setCssProps({ "--belki-year-open": String(openCount) });
    stack.setCssProps({ "--belki-stack-order": String(collapsedQuarters.indexOf(true) + 1) });
  }
  for (let q = 1; q <= 4; q++) {
    const inQuarter = entries.filter((e) => quarterOf(entryFirstDay(e)) === q);
    const collapsed = collapsedQuarters[q - 1];
    const column = (collapsed && stack ? stack : grid).createDiv({ cls: "belki-year-quarter" });
    column.setCssProps({ order: String(q) });
    column.toggleClass("is-current", q === currentQuarter);
    column.toggleClass("is-collapsed", collapsed);
    const head = column.createDiv({
      cls: "belki-year-quarter-head",
      attr: { role: "button", tabindex: "0", "aria-expanded": String(!collapsed), "aria-label": `${collapsed ? "Expand" : "Collapse"} Q${q}` }
    });
    const toggle = () => {
      state.collapsed.set(`${state.year}-Q${q}`, !collapsed);
      host.render();
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
    setIcon(head.createSpan({ cls: "belki-year-quarter-chevron" }), collapsed ? "chevron-right" : "chevron-down");
    head.createEl("h2", { text: `Q${q}` });
    head.createSpan({ cls: "belki-year-quarter-range", text: `${MONTHS[(q - 1) * 3].slice(0, 3)} – ${MONTHS[(q - 1) * 3 + 2].slice(0, 3)}` });
    if (q === currentQuarter) head.createSpan({ cls: "belki-year-now", text: "Now" });
    head.createSpan({ cls: "belki-section-count", text: String(inQuarter.length) });
    if (collapsed) continue;
    const body = column.createDiv({ cls: "belki-year-quarter-body" });
    if (!inQuarter.length) body.createDiv({ cls: "belki-year-empty", text: "Nothing planned yet." });
    const anyTime = inQuarter.filter((e) => e.precision === "quarter");
    if (anyTime.length) {
      body.createDiv({ cls: "belki-year-month", text: `Any time in Q${q}` });
      for (const entry of anyTime) renderEntryCard(host, body, entry, today, archivedIds.has(entry.id));
    }
    for (let m = (q - 1) * 3; m < q * 3; m++) {
      const inMonth = inQuarter.filter((e) => e.precision !== "quarter" && Number(entryFirstDay(e).slice(5, 7)) - 1 === m);
      if (!inMonth.length) continue;
      body.createDiv({ cls: "belki-year-month", text: MONTHS[m] });
      for (const entry of inMonth) renderEntryCard(host, body, entry, today, archivedIds.has(entry.id));
    }
    if (!isPastYear) {
      if (state.addQuarter === q) {
        renderAddForm(host, state, body, q);
      } else {
        const add = body.createEl("button", { cls: "belki-year-add", text: `+ Add to Q${q}`, attr: { type: "button" } });
        add.addEventListener("click", () => {
          state.addQuarter = q;
          host.render();
        });
      }
    }
  }
}

function renderEntryCard(host: PlanningHost, parent: HTMLElement, entry: Task, today: string, readOnly: boolean) {
  const card = parent.createEl("button", { cls: "belki-year-entry", attr: { type: "button" } });
  const missed = isMissedMilestone(entry, today);
  card.toggleClass("is-past", isPastEntry(entry, today) && !missed);
  card.toggleClass("is-today", isEntryOn(entry, today));
  card.toggleClass("is-done", entry.completed);
  const first = entryFirstDay(entry);
  const date = card.createSpan({ cls: "belki-year-date" });
  const days = entryDays(entry);
  if (entry.precision) {
    // No day to show: the month or quarter itself, marked as a period.
    date.addClass("is-period");
    date.createEl("b", { text: entry.precision === "quarter" ? `Q${quarterOf(first)}` : fmt(first, { month: "short" }) });
    date.createEl("small", { text: entry.precision === "quarter" ? "quarter" : "month" });
  } else {
    date.createEl("b", { text: days > 1 ? `${fmt(first, { day: "numeric" })}\u2013${fmt(entry.due, { day: "numeric" })}` : fmt(first, { day: "numeric" }) });
    date.toggleClass("is-range", days > 1);
    date.createEl("small", { text: fmt(first, { weekday: "short" }) });
  }
  const content = card.createSpan({ cls: "belki-year-entry-content" });
  host.renderLinkedTitle(entry.title, content.createSpan({ cls: "belki-year-entry-title" }));
  const pills: [string, string][] = [];
  if (entry.milestone) pills.push(["is-milestone", "Milestone"]);
  if (days > 1 && !entry.precision) pills.push(["", `${days} days`]);
  if (isEntryOn(entry, today)) pills.push(["is-today", "Today"]);
  if (missed) pills.push(["is-missed", "Not reached"]);
  if (entry.milestone && entry.completed) pills.push(["", "✓ Reached"]);
  if (pills.length) {
    const meta = content.createSpan({ cls: "belki-year-entry-meta" });
    for (const [cls, text] of pills) {
      const pill = meta.createSpan({ cls: `belki-year-pill ${cls}`.trim() });
      if (cls === "is-milestone") pill.createSpan({ cls: "belki-year-diamond" });
      pill.appendText(text);
    }
  }
  if (entry.calendar) {
    const source = content.createSpan({ cls: "belki-year-entry-meta" }).createSpan({ cls: "belki-year-pill" });
    source.createSpan({ cls: "belki-agenda-dot" }).setCssStyles({ backgroundColor: entry.calendar.color });
    source.appendText(entry.calendar.feedName);
  }
  card.addEventListener("click", () => {
    if (entry.calendar) host.openEvent(entry.calendar.event);
    else new PlanningEntryModal(host, entry, readOnly).open();
  });
}

function renderAddForm(host: PlanningHost, state: YearPlanState, parent: HTMLElement, quarter: number) {
  const form = parent.createEl("form", { cls: "belki-year-form" });
  const titleLabel = form.createEl("label", { text: "Title" });
  const title = titleLabel.createEl("input", { attr: { type: "text", required: "", autocomplete: "off" } });
  const whenLabel = form.createEl("label", { text: "When" });
  const when = whenLabel.createEl("select", { cls: "dropdown" });
  when.createEl("option", { text: "On a day", value: "day" });
  const firstMonth = (quarter - 1) * 3;
  for (let m = firstMonth; m < firstMonth + 3; m++) when.createEl("option", { text: `Sometime in ${MONTHS[m]}`, value: `month-${m + 1}` });
  when.createEl("option", { text: `Sometime in Q${quarter}`, value: "quarter" });
  const row = form.createDiv({ cls: "belki-year-form-row" });
  const dateLabel = row.createEl("label", { text: "Date" });
  const month = String(firstMonth + 1).padStart(2, "0");
  const date = dateLabel.createEl("input", { attr: { type: "date" } });
  date.value = `${state.year}-${month}-01`;
  const untilLabel = row.createEl("label", { text: "Until (optional)" });
  const until = untilLabel.createEl("input", { attr: { type: "date" } });
  when.addEventListener("change", () => row.toggle(when.value === "day"));
  const msLabel = form.createEl("label", { cls: "belki-year-form-check" });
  const milestone = msLabel.createEl("input", { attr: { type: "checkbox" } });
  msLabel.appendText("Milestone");
  const error = form.createDiv({ cls: "belki-year-form-error" });
  error.hide();
  const actions = form.createDiv({ cls: "belki-year-form-actions" });
  const cancel = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
  actions.createEl("button", { cls: "mod-cta", text: "Add", attr: { type: "submit" } });
  cancel.addEventListener("click", () => {
    state.addQuarter = null;
    host.render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fail = (message: string) => {
      error.setText(message);
      error.show();
    };
    if (!title.value.trim()) return fail("Enter a title.");
    if (when.value !== "day") {
      const m = when.value === "quarter" ? firstMonth + 1 : Number(when.value.slice(6));
      void host.store.createPlanningEntry({
        title: title.value,
        date: `${state.year}-${String(m).padStart(2, "0")}-01`,
        precision: when.value === "quarter" ? "quarter" : "month",
        milestone: milestone.checked
      }).then((saved) => {
        if (!saved) return;
        state.addQuarter = null;
        host.render();
      });
      return;
    }
    if (!isIsoDate(date.value)) return fail("Enter a date.");
    if (until.value && until.value < date.value) return fail("“Until” must be on or after the date.");
    const multiDay = isIsoDate(until.value) && until.value > date.value;
    void host.store.createPlanningEntry({
      title: title.value,
      date: multiDay ? until.value : date.value,
      start: multiDay ? date.value : void 0,
      milestone: milestone.checked
    }).then((saved) => {
      if (!saved) return;
      state.addQuarter = null;
      state.year = Number(date.value.slice(0, 4));
      host.render();
    });
  });
  window.setTimeout(() => title.focus(), 0);
}

/** Compact list of entries above Today, Upcoming and in the Overview. */
export function renderPlanningStrip(host: PlanningHost, parent: HTMLElement, heading: string, entries: Task[], openYearPlan: () => void) {
  if (!entries.length) return;
  const today = todayIso();
  const strip = parent.createDiv({ cls: "belki-planning-strip" });
  const head = strip.createDiv({ cls: "belki-planning-strip-head" });
  head.createSpan({ text: heading });
  const more = head.createEl("button", { cls: "belki-planning-strip-more", text: "Year plan →", attr: { type: "button" } });
  more.addEventListener("click", openYearPlan);
  for (const entry of entries) {
    const row = strip.createEl("button", { cls: "belki-planning-strip-row", attr: { type: "button" } });
    const first = entryFirstDay(entry);
    const when = entry.precision === "quarter" ? `Q${quarterOf(first)} ${first.slice(0, 4)}`
      : entry.precision === "month" ? fmt(first, { month: "long" })
      : isEntryOn(entry, today)
      ? (entryDays(entry) > 1 ? `Today · day ${Math.round((parseIso(today).getTime() - parseIso(first).getTime()) / 864e5) + 1}/${entryDays(entry)}` : "Today")
      : fmt(first, { weekday: "short", day: "numeric", month: "short" });
    row.createSpan({ cls: "belki-planning-strip-when", text: when });
    if (entry.milestone) row.createSpan({ cls: "belki-year-diamond", attr: { "aria-label": "Milestone" } });
    host.renderLinkedTitle(entry.title, row.createSpan({ cls: "belki-planning-strip-title" }));
    row.addEventListener("click", () => new PlanningEntryModal(host, entry, false).open());
  }
}

export class PlanningEntryModal extends Modal {
  host: PlanningHost;
  entry: Task;
  readOnly: boolean;
  constructor(host: PlanningHost, entry: Task, readOnly: boolean) {
    super(host.app);
    this.host = host;
    this.entry = entry;
    this.readOnly = readOnly;
  }
  onOpen() {
    const { contentEl, entry, host } = this;
    const today = todayIso();
    contentEl.empty();
    contentEl.addClass("belki-planning-modal");
    this.setTitle(entry.title.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias?: string) => alias || target));
    const status = this.readOnly ? "Archived"
      : entry.milestone ? (entry.completed ? "Reached" : isMissedMilestone(entry, today) ? "Not reached, the date has passed" : "Open")
      : isPastEntry(entry, today) ? "Past" : isEntryOn(entry, today) ? "Today" : "Upcoming";
    const first = entryFirstDay(entry);
    contentEl.createEl("p", { cls: "belki-planning-modal-kind", text: `${entry.milestone ? "Milestone · " : ""}Q${quarterOf(first)} ${first.slice(0, 4)} · ${status}` });
    contentEl.createEl("p", { cls: "belki-planning-modal-when", text: formatEntryWhen(entry) });
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    if (this.readOnly) {
      actions.createEl("button", { text: "Close", attr: { type: "button" } }).addEventListener("click", () => this.close());
      return;
    }
    const add = (text: string, onClick: () => void, cls = "") => {
      const button = actions.createEl("button", { cls, text, attr: { type: "button" } });
      button.addEventListener("click", onClick);
    };
    add("Delete", () => {
      this.close();
      new ConfirmModal(host.app, {
        title: "Delete planning entry?",
        subject: entry.title,
        body: "This removes the line from your tasks file. You can still undo it right after.",
        confirmText: "Delete",
        destructive: true
      }, () => {
        void host.store.deleteTask(entry.id);
      }).open();
    }, "mod-warning");
    add("Show in file", () => {
      this.close();
      void host.openTaskInNote(entry);
    });
    add("Edit", () => {
      this.close();
      void host.store.editTaskInEditor(entry.id);
    });
    if (entry.milestone) {
      add(entry.completed ? "Mark as open" : "Mark as reached", () => {
        this.close();
        const reached = !entry.completed;
        void host.store.updateTask(entry.id, reached ? { completed: true, completedDate: todayIso() } : { completed: false, completedDate: void 0 })
          .then(() => new Notice(reached ? "Milestone reached." : "Milestone open again."));
      }, "mod-cta");
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}
