import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import type { ReleaseNotes } from "../changelog";

const CHANGELOG_URL = "https://github.com/leotomhal/sector-tasks-obsidian/blob/main/CHANGELOG.md";

/** "What's new" after an update, rendered from the bundled CHANGELOG.md. */
export class ReleaseNotesModal extends Modal {
  entries: ReleaseNotes[];
  component: Component;
  constructor(app: App, entries: ReleaseNotes[]) {
    super(app);
    this.entries = entries;
    this.component = new Component();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-release-notes");
    this.component.load();
    this.setTitle(this.entries.length === 1 ? `What's new in Sector Tasks ${this.entries[0].version}` : "What's new in Sector Tasks");
    for (const entry of this.entries) {
      const section = contentEl.createDiv({ cls: "belki-release-notes-entry" });
      if (this.entries.length > 1) section.createEl("h3", { text: `Version ${entry.version}` });
      const body = section.createDiv({ cls: "belki-release-notes-body" });
      void MarkdownRenderer.render(this.app, entry.body, body, "", this.component);
    }
    const footer = contentEl.createDiv({ cls: "belki-release-notes-footer" });
    footer.createEl("a", { text: "Full changelog", href: CHANGELOG_URL });
    footer.createSpan({ cls: "belki-release-notes-hint", text: "You can turn these notes off in the plugin settings." });
    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const closeButton = actions.createEl("button", { cls: "mod-cta", text: "Got it", attr: { type: "button" } });
    closeButton.addEventListener("click", () => this.close());
  }
  onClose() {
    this.component.unload();
    this.contentEl.empty();
  }
}
