import { App, Modal } from "obsidian";

export interface ConfirmOptions {
  title: string;
  /** Shown highlighted, e.g. the task title or the sector being changed. */
  subject?: string;
  body: string;
  confirmText: string;
  /** Red confirm button for actions that remove or rewrite things. */
  destructive?: boolean;
}

/**
 * A small confirmation dialog. Uses Obsidian's own modal and button styles
 * (mod-warning / mod-cta), since modals render outside the board and don't
 * inherit its colors.
 */
export class ConfirmModal extends Modal {
  options: ConfirmOptions;
  onConfirm: () => void;
  onDismiss: () => void;
  confirmed: boolean;
  constructor(app: App, options: ConfirmOptions, onConfirm: () => void, onDismiss: () => void = () => {}) {
    super(app);
    this.options = options;
    this.onConfirm = onConfirm;
    this.onDismiss = onDismiss;
    this.confirmed = false;
  }
  onOpen() {
    const { contentEl, options } = this;
    contentEl.empty();
    this.setTitle(options.title);
    if (options.subject) contentEl.createEl("p", { cls: "belki-confirm-subject", text: options.subject });
    contentEl.createEl("p", { cls: "belki-confirm-hint", text: options.body });
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const confirmButton = actions.createEl("button", {
      cls: options.destructive ? "mod-warning" : "mod-cta",
      text: options.confirmText,
      attr: { type: "button" }
    });
    confirmButton.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
      this.onConfirm();
    });
    confirmButton.focus();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.confirmed) this.onDismiss();
  }
}

/** Resolves true when the user confirms, false when they cancel or close the dialog. */
export function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, () => resolve(true), () => resolve(false)).open();
  });
}
