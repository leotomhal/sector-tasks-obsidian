import { App, Modal, Notice, Platform } from "obsidian";
import { stripListMarker } from "../taskStore";

/** Lines that would become tasks: list markers dropped, empty lines skipped. */
export function brainDumpLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => stripListMarker(line).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Brain dump: one line per task, all saved to the Inbox at once. Text that
 * wasn't saved is handed back through `keepDraft`, so closing by accident
 * doesn't lose it.
 */
export class BrainDumpModal extends Modal {
  draft: string;
  save: (lines: string[]) => Promise<number>;
  keepDraft: (text: string) => void;
  saved = false;
  textarea!: HTMLTextAreaElement;
  constructor(app: App, draft: string, save: (lines: string[]) => Promise<number>, keepDraft: (text: string) => void) {
    super(app);
    this.draft = draft;
    this.save = save;
    this.keepDraft = keepDraft;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("belki-brain-dump-modal");
    this.setTitle("Brain dump");
    contentEl.createDiv({ cls: "belki-brain-dump-hint", text: "One task per line. Everything goes to the Inbox; sort it later." });
    this.textarea = contentEl.createEl("textarea", {
      cls: "belki-brain-dump-input",
      attr: { rows: "10", placeholder: "Call the printer about the flyer", "aria-label": "Tasks, one per line" }
    });
    this.textarea.value = this.draft;
    const footer = contentEl.createDiv({ cls: "belki-brain-dump-footer" });
    const count = footer.createSpan({ cls: "belki-brain-dump-count" });
    const actions = footer.createDiv({ cls: "belki-brain-dump-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    const submit = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
    const update = () => {
      const n = brainDumpLines(this.textarea.value).length;
      count.setText(n === 1 ? "1 task" : `${n} tasks`);
      submit.setText("Add to inbox");
      submit.disabled = n === 0;
    };
    const commit = async () => {
      const lines = brainDumpLines(this.textarea.value);
      if (!lines.length) return;
      submit.disabled = true;
      const saved = await this.save(lines);
      if (saved > 0) {
        this.saved = true;
        new Notice(saved === 1 ? "1 task added to the inbox." : `${saved} tasks added to the inbox.`);
        this.close();
      } else {
        submit.disabled = false;
        new Notice("Couldn't save the tasks. Your text is still here.");
      }
    };
    this.textarea.addEventListener("input", update);
    this.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void commit();
      }
    });
    cancel.addEventListener("click", () => this.close());
    submit.addEventListener("click", () => void commit());
    if (!Platform.isMobile) footer.createDiv({ cls: "belki-brain-dump-shortcut", text: Platform.isMacOS ? "⌘ + Enter to save" : "Ctrl + Enter to save" });
    update();
    window.setTimeout(() => {
      this.textarea.focus();
      const end = this.textarea.value.length;
      this.textarea.setSelectionRange(end, end);
    }, 0);
  }
  onClose() {
    this.keepDraft(this.saved ? "" : this.textarea?.value || "");
    this.contentEl.empty();
  }
}
