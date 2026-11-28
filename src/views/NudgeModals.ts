import { App, Modal, setIcon } from "obsidian";
import type { BelkiSettings, SectorConfig, Task } from "../types";
import { todayIso } from "../dateUtils";
import { intentionIsCurrent } from "../postpone";

export interface PostponeChoices {
  /** Opens the editor so the task can be cut down. */
  smaller: () => void;
  dropDate: () => void;
  /** Only offered when there is a long-term sector. */
  longTerm?: { label: string; move: () => void };
  keep: () => void;
}

/** The sector for "move to long term": one whose tag or name says "long". */
export function longTermSector(sectors: SectorConfig[]): SectorConfig | undefined {
  return sectors.find((s) => !s.isWaiting && (/long/i.test(s.tag) || /long/i.test(s.label)));
}

/** Asked when a task has been pushed back several times: what now? */
export class PostponeModal extends Modal {
  task: Task;
  count: number;
  choices: PostponeChoices;
  chosen = false;
  constructor(app: App, task: Task, count: number, choices: PostponeChoices) {
    super(app);
    this.task = task;
    this.count = count;
    this.choices = choices;
  }
  onOpen() {
    const { contentEl } = this;
    this.setTitle(`Moved ${this.count} times`);
    contentEl.createEl("p", { cls: "belki-confirm-subject belki-postpone-subject", text: this.task.title.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias?: string) => alias || target) });
    contentEl.createEl("p", { cls: "belki-confirm-hint", text: "You keep pushing this one back. That usually means it's too big, not really due, or not yours to do now." });
    const list = contentEl.createDiv({ cls: "belki-postpone-choices" });
    const add = (title: string, hint: string, run: () => void, cls = "") => {
      const button = list.createEl("button", { cls: `belki-postpone-choice ${cls}`.trim(), attr: { type: "button" } });
      button.createSpan({ cls: "belki-postpone-choice-title", text: title });
      button.createSpan({ cls: "belki-postpone-choice-hint", text: hint });
      button.addEventListener("click", () => {
        this.chosen = true;
        this.close();
        run();
      });
    };
    add("Make it smaller", "Rename it to the next small step.", this.choices.smaller, "mod-cta");
    add("Drop the date", "Keep the task, without a due date.", this.choices.dropDate);
    if (this.choices.longTerm) add(`Move to ${this.choices.longTerm.label}`, "Out of the way until you plan it again.", this.choices.longTerm.move);
    add("Keep the new date", "Ask again after a few more moves.", this.choices.keep);
  }
  onClose() {
    if (!this.chosen) this.choices.keep();
    this.contentEl.empty();
  }
}

/** One sentence for the coming week, asked after the weekly review. */
export class IntentionModal extends Modal {
  current: string;
  save: (text: string) => void;
  constructor(app: App, current: string, save: (text: string) => void) {
    super(app);
    this.current = current;
    this.save = save;
  }
  onOpen() {
    const { contentEl } = this;
    this.setTitle("Next week");
    contentEl.createEl("p", { cls: "belki-confirm-hint", text: "In one sentence: what should really have happened by the end of next week? It stays at the top of today until your next weekly review." });
    const input = contentEl.createEl("textarea", { cls: "belki-intention-input", attr: { rows: "3", "aria-label": "Intention for next week" } });
    input.value = this.current;
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const skip = actions.createEl("button", { text: this.current ? "Cancel" : "Skip", attr: { type: "button" } });
    const ok = actions.createEl("button", { cls: "mod-cta", text: "Save", attr: { type: "button" } });
    const submit = () => {
      this.save(input.value.replace(/\s+/g, " ").trim());
      this.close();
    };
    skip.addEventListener("click", () => this.close());
    ok.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    window.setTimeout(() => input.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** Opens the intention dialog and stores the answer; an empty answer clears it. */
export function editWeeklyIntention(app: App, settings: BelkiSettings, save: () => Promise<void>, after: () => void) {
  new IntentionModal(app, settings.weeklyIntention?.text || "", (text) => {
    settings.weeklyIntention = text ? { text, setOn: todayIso() } : null;
    void save().then(after);
  }).open();
}

/** "This week: …" at the top of today, while the intention is current. Click to edit, × to clear. */
export function renderIntentionBanner(parent: HTMLElement, app: App, settings: BelkiSettings, save: () => Promise<void>, after: () => void) {
  const intention = settings.weeklyIntention;
  if (!settings.weeklyIntentionEnabled || !intention || !intentionIsCurrent(intention.setOn, todayIso())) return;
  const banner = parent.createDiv({ cls: "belki-intention", attr: { role: "button", tabindex: "0", "aria-label": "Edit intention for the week" } });
  banner.createSpan({ cls: "belki-intention-label", text: "This week" });
  banner.createSpan({ cls: "belki-intention-text", text: intention.text });
  const clear = banner.createEl("button", { cls: "belki-intention-clear", attr: { type: "button", "aria-label": "Clear intention" } });
  setIcon(clear, "x");
  const edit = () => editWeeklyIntention(app, settings, save, after);
  banner.addEventListener("click", edit);
  banner.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      edit();
    }
  });
  clear.addEventListener("click", (event) => {
    event.stopPropagation();
    settings.weeklyIntention = null;
    void save().then(after);
  });
}
