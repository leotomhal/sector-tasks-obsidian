import { App, Modal } from "obsidian";
import type { RepeatRule, SectorConfig, Task } from "../types";
import { addDaysIso, isIsoDate, todayIso } from "../dateUtils";
import { dedupeLabels, normalizeLabelName } from "../labels";
import { getPriorityLabel } from "../priority";
import { formFromRule, isCustomRule, ruleFromForm } from "../recurrenceForm";
import type { RecurrenceForm } from "../recurrenceForm";
import { serializeTasksRecurrence } from "../tasksFormat";

/** What the editor hands back; only the fields it edits. */
export interface TaskEdit {
  title: string;
  project?: string;
  due?: string;
  priority: string;
  labels: string[];
  repeat?: RepeatRule;
  start?: string;
  milestone?: boolean;
  /** Planning only: "month" or "quarter" when there's no exact day. */
  precision?: string;
}

export interface TaskEditorOptions {
  /** The task being edited, or undefined to create one. */
  task?: Task;
  /** Sector preselected for a new task ("" = Inbox). */
  sector?: string;
  /** Edit a year-plan entry: title, date, until, milestone. */
  planning?: boolean;
  sectors: SectorConfig[];
  knownLabels: string[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FREQUENCIES: [string, string][] = [
  ["none", "Never"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday (Mon–Fri)"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
  ["yearly", "Every year"]
];
const UNIT: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

/** Opens the editor; resolves with the edited values, or null when cancelled. */
export function openTaskEditor(app: App, options: TaskEditorOptions): Promise<TaskEdit | null> {
  return new Promise((resolve) => {
    new TaskEditModal(app, options, resolve).open();
  });
}

let fieldCounter = 0;

export class TaskEditModal extends Modal {
  options: TaskEditorOptions;
  done: (result: TaskEdit | null) => void;
  settled = false;
  constructor(app: App, options: TaskEditorOptions, done: (result: TaskEdit | null) => void) {
    super(app);
    this.options = options;
    this.done = done;
  }
  finish(result: TaskEdit | null) {
    if (this.settled) return;
    this.settled = true;
    this.done(result);
  }
  onOpen() {
    const { contentEl, options } = this;
    const task = options.task;
    contentEl.empty();
    contentEl.addClass("belki-editor");
    const planning = options.planning === true;
    this.setTitle(task ? (planning ? "Edit planning entry" : "Edit task") : (planning ? "New planning entry" : "New task"));
    const form = contentEl.createEl("form", { cls: "belki-editor-form" });
    const field = (label: string, cls = "") => {
      const id = `belki-editor-${++fieldCounter}`;
      const wrap = form.createDiv({ cls: `belki-editor-field ${cls}`.trim() });
      wrap.createEl("label", { text: label, attr: { for: id } });
      return { wrap, id };
    };

    const titleField = field("Title");
    const title = titleField.wrap.createEl("input", { attr: { id: titleField.id, type: "text", autocomplete: "off" } });
    title.value = task?.title || "";
    const error = form.createDiv({ cls: "belki-editor-error" });
    error.hide();

    let result: () => TaskEdit | string;
    if (planning) {
      result = this.renderPlanningFields(form, field, title);
    } else {
      result = this.renderTaskFields(form, field, title);
    }

    const actions = form.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    actions.createEl("button", { cls: "mod-cta", text: task ? "Save" : "Add", attr: { type: "submit" } });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = result();
      if (typeof value === "string") {
        error.setText(value);
        error.show();
        return;
      }
      this.finish(value);
      this.close();
    });
    // Cmd/Ctrl+Enter saves from any field (Enter alone does in single-line inputs).
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    window.setTimeout(() => {
      title.focus();
      title.setSelectionRange(title.value.length, title.value.length);
    }, 0);
  }

  renderTaskFields(form: HTMLFormElement, field: (label: string, cls?: string) => { wrap: HTMLElement; id: string }, title: HTMLInputElement): () => TaskEdit | string {
    const { options } = this;
    const task = options.task;
    const row = form.createDiv({ cls: "belki-editor-row" });
    const inRow = (label: string) => {
      const id = `belki-editor-${++fieldCounter}`;
      const wrap = row.createDiv({ cls: "belki-editor-field" });
      wrap.createEl("label", { text: label, attr: { for: id } });
      return { wrap, id };
    };

    const sectorField = inRow("Sector");
    const sector = sectorField.wrap.createEl("select", { cls: "dropdown", attr: { id: sectorField.id } });
    sector.createEl("option", { text: "Inbox", value: "" });
    for (const s of options.sectors) sector.createEl("option", { text: s.label, value: s.tag });
    const currentSector = task ? task.project || "" : options.sector || "";
    if (currentSector && !options.sectors.some((s) => s.tag.toLowerCase() === currentSector.toLowerCase())) {
      sector.createEl("option", { text: `#${currentSector}`, value: currentSector });
    }
    sector.value = options.sectors.find((s) => s.tag.toLowerCase() === currentSector.toLowerCase())?.tag ?? currentSector;

    const priorityField = inRow("Priority");
    const priority = priorityField.wrap.createEl("select", { cls: "dropdown", attr: { id: priorityField.id } });
    priority.createEl("option", { text: "None", value: "none" });
    for (const p of ["P1", "P2", "P3", "P4"]) priority.createEl("option", { text: getPriorityLabel(p), value: p });
    priority.value = task?.priority || "none";

    const dueField = field("Due date");
    const dueRow = dueField.wrap.createDiv({ cls: "belki-editor-inline" });
    const due = dueRow.createEl("input", { attr: { id: dueField.id, type: "date" } });
    due.value = task?.due || "";
    for (const [label, value] of [["Today", todayIso()], ["Tomorrow", addDaysIso(1)], ["Next week", addDaysIso(7)], ["None", ""]]) {
      const quick = dueRow.createEl("button", { cls: "belki-editor-chip", text: label, attr: { type: "button" } });
      quick.addEventListener("click", () => {
        due.value = value;
        due.dispatchEvent(new Event("change"));
      });
    }

    // Labels as removable chips plus an input with suggestions from existing labels.
    const labelsField = field("Labels");
    let labels = dedupeLabels(task?.labels || []);
    const chips = labelsField.wrap.createDiv({ cls: "belki-editor-labels" });
    const labelInput = labelsField.wrap.createEl("input", { attr: { id: labelsField.id, type: "text", placeholder: "Type a label, then press enter", autocomplete: "off" } });
    const suggestions = labelsField.wrap.createDiv({ cls: "belki-editor-suggestions" });
    const addLabel = (raw: string) => {
      const name = normalizeLabelName(raw);
      if (!name || !/^[A-Za-z0-9_\-/À-ɏ]+$/.test(name)) return;
      labels = dedupeLabels([...labels, name]);
      labelInput.value = "";
      renderLabels();
    };
    const renderLabels = () => {
      chips.empty();
      for (const label of labels) {
        const chip = chips.createSpan({ cls: "belki-editor-label", text: `#${label}` });
        const remove = chip.createEl("button", { text: "×", attr: { type: "button", "aria-label": `Remove #${label}` } });
        remove.addEventListener("click", () => {
          labels = labels.filter((l) => l !== label);
          renderLabels();
        });
      }
      suggestions.empty();
      const typed = normalizeLabelName(labelInput.value);
      const matches = options.knownLabels.filter((l) => !labels.includes(l) && (!typed || l.startsWith(typed))).slice(0, 8);
      for (const match of matches) {
        const chip = suggestions.createEl("button", { cls: "belki-editor-chip", text: `#${match}`, attr: { type: "button" } });
        chip.addEventListener("click", () => {
          addLabel(match);
          labelInput.focus();
        });
      }
    };
    labelInput.addEventListener("input", renderLabels);
    labelInput.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === ",") && !(event.metaKey || event.ctrlKey)) {
        if (!labelInput.value.trim()) return;
        event.preventDefault();
        addLabel(labelInput.value);
      } else if (event.key === "Backspace" && !labelInput.value && labels.length) {
        labels = labels.slice(0, -1);
        renderLabels();
      }
    });
    renderLabels();

    // Recurrence. An existing rule the form can't express (e.g. "every 15 july")
    // is kept exactly as written unless the user changes the repeat settings.
    const original = task?.repeat;
    let touched = false;
    const recurrence: RecurrenceForm = formFromRule(original, task?.due);
    if (isCustomRule(original)) recurrence.frequency = "yearly";
    const repeatField = field("Repeat");
    const repeatRow = repeatField.wrap.createDiv({ cls: "belki-editor-inline" });
    const frequency = repeatRow.createEl("select", { cls: "dropdown", attr: { id: repeatField.id } });
    for (const [value, text] of FREQUENCIES) frequency.createEl("option", { text, value });
    frequency.value = recurrence.frequency;
    const detail = repeatField.wrap.createDiv({ cls: "belki-editor-repeat-detail" });
    const note = repeatField.wrap.createDiv({ cls: "belki-editor-hint" });
    const renderDetail = () => {
      detail.empty();
      const f = recurrence.frequency;
      if (f === "none") {
        detail.hide();
      } else {
        detail.show();
        if (UNIT[f]) {
          const every = detail.createEl("label", { cls: "belki-editor-inline-label" });
          every.appendText("Every");
          const n = every.createEl("input", { attr: { type: "number", min: "1", step: "1" } });
          n.value = String(recurrence.interval);
          every.appendText(`${UNIT[f]}(s)`);
          n.addEventListener("change", () => {
            recurrence.interval = Math.max(1, Math.floor(Number(n.value) || 1));
            touched = true;
            renderNote();
          });
        }
        if (f === "weekly") {
          const on = detail.createEl("label", { cls: "belki-editor-inline-label", text: "On" });
          const day = on.createEl("select", { cls: "dropdown" });
          WEEKDAYS.forEach((name, i) => day.createEl("option", { text: name, value: String(i) }));
          day.value = String(recurrence.weekday);
          day.addEventListener("change", () => {
            recurrence.weekday = Number(day.value);
            touched = true;
            renderNote();
          });
        }
        if (f === "monthly") {
          const on = detail.createEl("label", { cls: "belki-editor-inline-label", text: "On day" });
          const day = on.createEl("input", { attr: { type: "number", min: "1", max: "31", step: "1" } });
          day.value = String(recurrence.dayOfMonth);
          day.addEventListener("change", () => {
            recurrence.dayOfMonth = Math.min(31, Math.max(1, Math.floor(Number(day.value) || 1)));
            touched = true;
            renderNote();
          });
        }
        const whenDone = detail.createEl("label", { cls: "belki-editor-inline-label" });
        const box = whenDone.createEl("input", { attr: { type: "checkbox" } });
        box.checked = recurrence.whenDone;
        whenDone.appendText("Count from when it's done");
        box.addEventListener("change", () => {
          recurrence.whenDone = box.checked;
          touched = true;
          renderNote();
        });
      }
      renderNote();
    };
    const currentRule = () => (touched ? ruleFromForm(recurrence) : original);
    const renderNote = () => {
      const rule = currentRule();
      note.setText(rule ? `Written as: \u{1F501} ${serializeTasksRecurrence(rule)}` : "");
      note.toggle(Boolean(rule));
    };
    frequency.addEventListener("change", () => {
      recurrence.frequency = frequency.value;
      touched = true;
      renderDetail();
    });
    renderDetail();

    return () => {
      const text = title.value.replace(/\s+/g, " ").trim();
      if (!text) return "Enter a title.";
      if (due.value && !isIsoDate(due.value)) return "The due date isn't a valid date.";
      if (labelInput.value.trim()) addLabel(labelInput.value);
      return {
        title: text,
        project: sector.value || void 0,
        due: due.value || void 0,
        priority: priority.value,
        labels,
        repeat: currentRule()
      };
    };
  }

  renderPlanningFields(form: HTMLFormElement, field: (label: string, cls?: string) => { wrap: HTMLElement; id: string }, title: HTMLInputElement): () => TaskEdit | string {
    const task = this.options.task;
    const whenField = field("When");
    const kind = whenField.wrap.createEl("select", { cls: "dropdown", attr: { id: whenField.id } });
    for (const [value, text] of [["day", "On a day"], ["month", "Sometime in a month"], ["quarter", "Sometime in a quarter"]]) {
      kind.createEl("option", { text, value });
    }
    kind.value = task?.precision || "day";
    const today = todayIso();
    const baseDate = task?.due || today;

    // Exact day: date + optional end.
    const dayRow = form.createDiv({ cls: "belki-editor-row" });
    const inRow = (parent: HTMLElement, label: string) => {
      const id = `belki-editor-${++fieldCounter}`;
      const wrap = parent.createDiv({ cls: "belki-editor-field" });
      wrap.createEl("label", { text: label, attr: { for: id } });
      return { wrap, id };
    };
    const dateField = inRow(dayRow, "Date");
    const date = dateField.wrap.createEl("input", { attr: { id: dateField.id, type: "date" } });
    date.value = task && !task.precision ? task.start || task.due || "" : "";
    const untilField = inRow(dayRow, "Until (optional)");
    const until = untilField.wrap.createEl("input", { attr: { id: untilField.id, type: "date" } });
    until.value = task?.start && !task.precision ? task.due || "" : "";

    // Month: a month picker.
    const monthRow = form.createDiv({ cls: "belki-editor-row" });
    const monthField = inRow(monthRow, "Month");
    const month = monthField.wrap.createEl("input", { attr: { id: monthField.id, type: "month" } });
    month.value = baseDate.slice(0, 7);

    // Quarter: quarter + year.
    const quarterRow = form.createDiv({ cls: "belki-editor-row" });
    const quarterField = inRow(quarterRow, "Quarter");
    const quarter = quarterField.wrap.createEl("select", { cls: "dropdown", attr: { id: quarterField.id } });
    for (const q of [1, 2, 3, 4]) quarter.createEl("option", { text: `Q${q}`, value: String(q) });
    quarter.value = String(Math.floor((Number(baseDate.slice(5, 7)) - 1) / 3) + 1);
    const yearField = inRow(quarterRow, "Year");
    const year = yearField.wrap.createEl("input", { attr: { id: yearField.id, type: "number", min: "2000", max: "2100", step: "1" } });
    year.value = baseDate.slice(0, 4);

    const sync = () => {
      dayRow.toggle(kind.value === "day");
      monthRow.toggle(kind.value === "month");
      quarterRow.toggle(kind.value === "quarter");
    };
    kind.addEventListener("change", sync);
    sync();

    const msField = field("", "belki-editor-check");
    msField.wrap.querySelector("label")?.remove();
    const label = msField.wrap.createEl("label");
    const milestone = label.createEl("input", { attr: { type: "checkbox" } });
    milestone.checked = task?.milestone === true;
    label.appendText("Milestone");
    return () => {
      const text = title.value.replace(/\s+/g, " ").trim();
      if (!text) return "Enter a title.";
      const base = { title: text, priority: "none", labels: [] as string[], milestone: milestone.checked };
      if (kind.value === "month") {
        if (!/^\d{4}-\d{2}$/.test(month.value)) return "Pick a month.";
        return { ...base, due: `${month.value}-01`, start: void 0, precision: "month" };
      }
      if (kind.value === "quarter") {
        const y = Math.floor(Number(year.value));
        if (!(y >= 2000 && y <= 2100)) return "Enter a year.";
        const firstMonth = (Number(quarter.value) - 1) * 3 + 1;
        return { ...base, due: `${y}-${String(firstMonth).padStart(2, "0")}-01`, start: void 0, precision: "quarter" };
      }
      if (!isIsoDate(date.value)) return "Enter a date.";
      if (until.value && until.value < date.value) return "\u201CUntil\u201D must be on or after the date.";
      const multiDay = isIsoDate(until.value) && until.value > date.value;
      return {
        ...base,
        due: multiDay ? until.value : date.value,
        start: multiDay ? date.value : void 0,
        precision: void 0
      };
    };
  }

  onClose() {
    this.contentEl.empty();
    this.finish(null);
  }
}
