import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import type { BelkiSettings, Task } from "../types";
import { TaskStore } from "../taskStore";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./TaskBoardView";
import { addDaysIso, compareIsoDates, formatDueDateChip, todayIso } from "../dateUtils";
import { getPriorityColor } from "../priority";
import { normalizeTaskProject, projectDisplayName } from "../projects";

export const VIEW_TYPE_BELKI_TODAY = "sector-task-today";
export const TODAY_PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, none: 4 };
export function showDueDateMenu(store: TaskStore, task: Task, event: MouseEvent) {
  const menu = new Menu();
  const current = task.due;
  const options = [
    { label: "Today", value: todayIso() },
    { label: "Tomorrow", value: addDaysIso(1) },
    { label: "Next week", value: addDaysIso(7) }
  ];
  for (const option of options) {
    menu.addItem((item) => {
      item.setTitle(`Due: ${option.label}`).setChecked(current === option.value).onClick(() => {
        void store.updateTask(task.id, { due: option.value });
      });
    });
  }
  menu.addSeparator();
  menu.addItem((item) => {
    item.setTitle("Remove due date").setDisabled(!current).onClick(() => {
      void store.updateTask(task.id, { due: void 0 });
    });
  });
  menu.addSeparator();
  menu.addItem((item) => {
    item.setTitle("Edit in Tasks modal…").setIcon("pencil").onClick(() => {
      void store.updateTaskViaModal(task.id);
    });
  });
  menu.showAtMouseEvent(event);
}
export class TodaySidebarView extends ItemView {
  store: TaskStore;
  settings: BelkiSettings;
  unsubscribe?: () => void;
  collapsedSections?: Set<string>;
  constructor(leaf: WorkspaceLeaf, store: TaskStore, settings: BelkiSettings) {
    super(leaf);
    this.store = store;
    this.settings = settings;
    this.navigation = false;
  }
  getViewType() {
    return VIEW_TYPE_BELKI_TODAY;
  }
  getDisplayText() {
    return "Today's tasks";
  }
  getIcon() {
    return this.settings.icons.today || "calendar-check";
  }
  async onOpen() {
    this.unsubscribe = this.store.subscribe(() => this.render());
    this.render();
  }
  async onClose() {
    this.unsubscribe?.();
    this.updateTabBadge(0);
  }
  refresh() {
    this.render();
  }
  async openBoard() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        view.openToday();
      }
      this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BELKI, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }
  render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("belki-today-panel");
    const header = container.createDiv({ cls: "belki-today-header" });
    header.createSpan({ cls: "belki-today-heading", text: "Today" });
    const headerActions = header.createDiv({ cls: "belki-today-header-actions" });
    const boardButton = headerActions.createEl("button", {
      cls: "belki-today-icon-button",
      attr: { type: "button", "aria-label": "Open board" }
    });
    setIcon(boardButton, "layout-grid");
    boardButton.addEventListener("click", () => {
      void this.openBoard();
    });
    const addButton = headerActions.createEl("button", {
      cls: "belki-today-add",
      text: "+",
      attr: { type: "button", "aria-label": "Quick add task (Inbox)" }
    });
    addButton.addEventListener("click", () => {
      void this.store.createTaskViaModal("");
    });
    const archivedSet = new Set(this.settings.archivedProjects);
    const open = this.store.getTasks().filter(
      (t) => !t.completed && !archivedSet.has(normalizeTaskProject(t.project) || "")
    );
    const today = todayIso();
    const tomorrow = addDaysIso(1);
    const byPriority = (a: Task, b: Task) => (TODAY_PRIORITY_RANK[a.priority] ?? 4) - (TODAY_PRIORITY_RANK[b.priority] ?? 4) || a.title.localeCompare(b.title);
    const byUrgency = (a: Task, b: Task) => compareIsoDates(a.due || "", b.due || "") || byPriority(a, b);
    const overdue = open.filter((t) => t.due && t.due < today).sort(byUrgency);
    const dueToday = open.filter((t) => t.due === today).sort(byPriority);
    const dueTomorrow = open.filter((t) => t.due === tomorrow).sort(byPriority);
    this.updateTabBadge(overdue.length + dueToday.length);
    if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0) {
      container.createDiv({ cls: "belki-today-empty", text: "Nothing due today or tomorrow." });
      return;
    }
    if (overdue.length) {
      this.renderSection(container, "Overdue", overdue, true);
    }
    if (dueToday.length) {
      this.renderSection(container, "Due today", dueToday, false);
    }
    if (dueTomorrow.length) {
      this.renderSection(container, "Due tomorrow", dueTomorrow, false, true);
    }
  }
  updateTabBadge(count: number) {
    // tabHeaderEl is an internal, undocumented Obsidian API not present in the public types.
    const tabHeader = this.leaf && (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
    if (!tabHeader) return;
    let badge: HTMLElement | null = tabHeader.querySelector(".belki-today-tab-badge");
    if (count <= 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = tabHeader.createSpan({ cls: "belki-today-tab-badge" });
    }
    badge.setText(String(count));
  }
  renderSection(container: HTMLElement, label: string, tasks: Task[], showDate: boolean, collapsible = false) {
    if (!this.collapsedSections) this.collapsedSections = /* @__PURE__ */ new Set();
    const section = container.createDiv({ cls: "belki-today-section" });
    const head = section.createDiv({ cls: "belki-today-section-label" });
    const collapsed = collapsible && this.collapsedSections.has(label);
    if (collapsible) {
      head.addClass("is-collapsible");
      head.toggleClass("is-collapsed", collapsed);
      const chevron = head.createSpan({ cls: "belki-today-collapse-icon" });
      setIcon(chevron, "chevron-down");
      head.addEventListener("click", () => {
        if (this.collapsedSections.has(label)) {
          this.collapsedSections.delete(label);
        } else {
          this.collapsedSections.add(label);
        }
        this.render();
      });
    }
    head.createSpan({ text: label });
    head.createSpan({ cls: "belki-today-section-count", text: String(tasks.length) });
    if (collapsed) return;
    for (const task of tasks) {
      this.renderRow(section, task, showDate);
    }
  }
  renderRow(parent: HTMLElement, task: Task, showDate: boolean) {
    const row = parent.createDiv({ cls: "belki-today-row" });
    row.addEventListener("click", () => {
      void this.store.updateTaskViaModal(task.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showDueDateMenu(this.store, task, event);
    });
    const checkbox = row.createEl("button", {
      cls: "belki-today-checkbox",
      attr: { type: "button", "aria-label": `Complete ${task.title}` }
    });
    const priorityColor = getPriorityColor(task.priority);
    checkbox.setCssProps({ "--belki-today-priority": priorityColor.color });
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.store.toggleComplete(task.id);
    });
    const content = row.createDiv({ cls: "belki-today-content" });
    content.createDiv({ cls: "belki-today-task-title", text: task.title });
    const metaParts: string[] = [];
    if (showDate && task.due) {
      metaParts.push(formatDueDateChip(task.due));
    }
    const project = normalizeTaskProject(task.project);
    if (project) {
      metaParts.push(projectDisplayName(project));
    }
    if (metaParts.length) {
      content.createDiv({
        cls: `belki-today-meta${showDate && task.due ? " is-overdue" : ""}`,
        text: metaParts.join(" · ")
      });
    }
  }
};
