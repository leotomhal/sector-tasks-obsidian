import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import type { BelkiSettings, Task } from "../types";
import { TaskStore } from "../taskStore";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./TaskBoardView";
import { addDaysIso, compareIsoDates, formatDueDateChip, shiftIsoDate, todayIso } from "../dateUtils";
import { getPriorityColor, getPriorityLabel } from "../priority";
import { normalizeTaskProject, projectDisplayName } from "../projects";
import { isEntryOn, upcomingEntries } from "../planning";

export const VIEW_TYPE_BELKI_TODAY = "sector-task-today";
export const TODAY_PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, none: 4 };
/** "Fri 6 Nov" in the user's locale; adds the year only when it differs. */
export function formatSnoozeDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(void 0, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...y !== new Date().getFullYear() ? { year: "numeric" } : {}
  }).format(date);
}
/**
 * Right-click menu for a multi-selection: due date, snooze and priority for all
 * selected tasks at once, in one save. Snooze moves each task from its own date.
 */
export function showSelectionContextMenu(store: TaskStore, tasks: Task[], event: MouseEvent, onDone: () => void) {
  const menu = new Menu();
  const ids = tasks.map((t) => t.id);
  const apply = (patches: Map<string, Partial<Task>>) => {
    void store.updateEachTask(patches).then(onDone);
  };
  const same = (patch: Partial<Task>) => apply(new Map(ids.map((id) => [id, patch])));
  menu.addItem((item) => item.setTitle(`${tasks.length} tasks selected`).setDisabled(true));
  menu.addSeparator();
  for (const [label, value] of [["Today", todayIso()], ["Tomorrow", addDaysIso(1)], ["Next week", addDaysIso(7)]]) {
    menu.addItem((item) => item.setTitle(`Due: ${label}`).onClick(() => same({ due: value })));
  }
  menu.addItem((item) => item.setTitle("Remove due date").onClick(() => same({ due: void 0 })));
  menu.addSeparator();
  for (const days of [1, 3, 7]) {
    menu.addItem((item) => item.setTitle(`Snooze ${days === 1 ? "1 day" : `${days} days`} each`).onClick(() => {
      apply(new Map(tasks.map((t) => {
        const base = t.due && t.due > todayIso() ? t.due : todayIso();
        return [t.id, { due: shiftIsoDate(base, days) }];
      })));
    }));
  }
  menu.addSeparator();
  for (const priority of ["P1", "P2", "P3", "P4"]) {
    menu.addItem((item) => item.setTitle(getPriorityLabel(priority)).onClick(() => same({ priority })));
  }
  menu.addItem((item) => item.setTitle("No priority").onClick(() => same({ priority: "none" })));
  menu.showAtMouseEvent(event);
}
export function showTaskContextMenu(store: TaskStore, task: Task, event: MouseEvent) {
  const menu = new Menu();
  const currentDue = task.due;
  const dueOptions = [
    { label: "Today", value: todayIso() },
    { label: "Tomorrow", value: addDaysIso(1) },
    { label: "Next week", value: addDaysIso(7) }
  ];
  for (const option of dueOptions) {
    menu.addItem((item) => {
      item.setTitle(`Due: ${option.label}`).setChecked(currentDue === option.value).onClick(() => {
        void store.updateTask(task.id, { due: option.value });
      });
    });
  }
  menu.addItem((item) => {
    item.setTitle("Remove due date").setDisabled(!currentDue).onClick(() => {
      void store.updateTask(task.id, { due: void 0 });
    });
  });
  menu.addSeparator();
  // Snooze pushes from the due date when it's still ahead, otherwise from today,
  // so an overdue task never lands in the past again. The menu shows the result.
  const base = currentDue && currentDue > todayIso() ? currentDue : todayIso();
  for (const days of [1, 3, 7]) {
    const target = shiftIsoDate(base, days);
    menu.addItem((item) => {
      item.setTitle(`Snooze ${days === 1 ? "1 day" : `${days} days`} \u00b7 ${formatSnoozeDate(target)}`).onClick(() => {
        void store.updateTask(task.id, { due: target });
      });
    });
  }
  menu.addSeparator();
  const currentPriority = task.priority || "none";
  for (const priority of ["P1", "P2", "P3", "P4"]) {
    menu.addItem((item) => {
      item.setTitle(getPriorityLabel(priority)).setChecked(currentPriority === priority).onClick(() => {
        void store.updateTask(task.id, { priority });
      });
    });
  }
  menu.addItem((item) => {
    item.setTitle("No priority").setDisabled(currentPriority === "none").onClick(() => {
      void store.updateTask(task.id, { priority: "none" });
    });
  });
  menu.addSeparator();
  menu.addItem((item) => {
    item.setTitle("Edit…").setIcon("pencil").onClick(() => {
      void store.editTaskInEditor(task.id);
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
      await leaves[0].loadIfDeferred();
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        view.openStartView();
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
    container.toggleClass("is-style-editorial", this.settings.visualStyle === "editorial");
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
      void this.store.createTaskInEditor("");
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
    // Year-plan entries running today or starting tomorrow (not counted in the badge).
    const planning = this.settings.planningEnabled ? upcomingEntries(this.store.getPlanningEntries(), today, 1) : [];
    if (planning.length) this.renderPlanning(container, planning, today);
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
  renderPlanning(container: HTMLElement, entries: Task[], today: string) {
    const section = container.createDiv({ cls: "belki-today-section belki-today-planning" });
    const head = section.createDiv({ cls: "belki-today-section-label" });
    head.createSpan({ text: "Planning" });
    head.createSpan({ cls: "belki-today-section-count", text: String(entries.length) });
    for (const entry of entries) {
      const row = section.createDiv({ cls: "belki-today-row belki-today-planning-row" });
      row.addEventListener("click", () => {
        void this.store.editTaskInEditor(entry.id);
      });
      row.createSpan({ cls: "belki-today-planning-when", text: isEntryOn(entry, today) ? "Today" : "Tomorrow" });
      if (entry.milestone) row.createSpan({ cls: "belki-year-diamond", attr: { "aria-label": "Milestone" } });
      row.createSpan({ cls: "belki-today-planning-title", text: entry.title.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_m, target: string, _a, alias?: string) => alias || target) });
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
      void this.store.editTaskInEditor(task.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showTaskContextMenu(this.store, task, event);
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
