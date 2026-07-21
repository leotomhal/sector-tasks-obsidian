import { App, ItemView, MarkdownView, Modal, Notice, Platform, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { showDueDateMenu } from "./TodaySidebarView";
import { getLabelColor, getProjectColor } from "../colors";
import { compareIsoDates, currentIsoWeekKey, currentMonthKey, isAfterToday, isBeforeToday, isToday, todayIso, yesterdayIso } from "../dateUtils";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../labels";
import { getPriorityClass, getPriorityColor, getPriorityLabel } from "../priority";
import { normalizeTaskProject, projectDisplayName, uniqueRealProjects } from "../projects";
import { buildReviewSteps, pruneReviewSession, reviewSectorNeighbors, reviewTypeLabel } from "../review";
import { applyBelkiFontSettings, applyBelkiThemeSettings, normalizeOverdueRange, overdueRangeLabel } from "../settings";
import { E_ID, SECTOR_SET } from "../tasksFormat";
import { OVERDUE_RANGES } from "../types";
import type { BelkiSettings, Task } from "../types";
import { TaskStore } from "../taskStore";

export const VIEW_TYPE_BELKI = "sector-task-board";
export const LINK_RE = /(\[\[([^\]|#\n]+?)(?:#([^\]|\n]+?))?(?:\|([^\]\n]+?))?\]\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>"')\]]+)|(www\.[a-zA-Z0-9][^\s<>"')\]]*)/g;
export function renderLinkedText(text: string, el: HTMLElement, app?: App) {
  LINK_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) el.appendText(text.slice(last, match.index));
    if (match[1]) {
      const notePath = match[2];
      const heading = match[3];
      const alias = match[4];
      const displayText = alias || notePath.split("/").pop() || notePath;
      const linkTarget = heading ? `${notePath}#${heading}` : notePath;
      if (app) {
        const a = el.createEl("a", { text: displayText, cls: "internal-link" });
        a.setAttribute("data-href", linkTarget);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          void app.workspace.openLinkText(linkTarget, "", false);
        });
      } else {
        el.appendText(displayText);
      }
      last = match.index + match[1].length;
    } else if (match[5]) {
      const a = el.createEl("a", { text: match[6], href: match[7], cls: "external-link" });
      a.setAttribute("rel", "noopener noreferrer");
      last = match.index + match[5].length;
    } else {
      const full = match[0];
      const url = full.replace(/[.,;:!?)\]]+$/, "");
      const trailing = full.slice(url.length);
      const href = url.startsWith("www.") ? `https://${url}` : url;
      const a = el.createEl("a", { text: url, href, cls: "external-link" });
      a.setAttribute("rel", "noopener noreferrer");
      if (trailing) el.appendText(trailing);
      last = match.index + full.length;
    }
  }
  if (last < text.length) el.appendText(text.slice(last));
}
export const SORT_OPTIONS = [
  { mode: "smart", label: "Smart" },
  { mode: "due", label: "Due date" },
  { mode: "priority", label: "Priority" },
  { mode: "deadline", label: "Deadline" },
  { mode: "created", label: "Created date" },
  { mode: "project", label: "Sector" },
  { mode: "alphabetical", label: "Alphabetical" }
];
export class TaskBoardView extends ItemView {
  store: TaskStore;
  settings: BelkiSettings;
  saveSettings: () => Promise<void>;
  mode: string;
  selectedProject: string | null;
  searchQuery: string;
  searchOpen: boolean;
  composerOpen: boolean;
  highlightedTaskId: string | null;
  activeFilter: string | null;
  activeLabel: string | null;
  draggedTaskId: string | null;
  draggedTaskIds: string[] | null;
  selectedTaskIds: Set<string>;
  mobileNavOpen: boolean;
  sortPopoverOpen: boolean;
  reviewOpen: boolean;
  reviewActionPending: boolean;
  projectActionsOpen: string | null;
  projectMenuEl: HTMLElement | null;
  sidebarScrollLeft: number;
  pendingScrollSnapshot: { top: number; left: number } | null;
  composerCleanup: (() => void) | null;
  renderScheduled: boolean;
  handleRootKeyDown: (event: KeyboardEvent) => void;
  unsubscribe?: () => void;
  constructor(leaf: WorkspaceLeaf, store: TaskStore, settings: BelkiSettings, saveSettings: () => Promise<void>) {
    super(leaf);
    this.store = store;
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.mode = "today";
    this.selectedProject = null;
    this.searchQuery = "";
    this.searchOpen = false;
    this.composerOpen = false;
    this.highlightedTaskId = null;
    this.activeFilter = null;
    this.activeLabel = null;
    this.draggedTaskId = null;
    this.draggedTaskIds = null;
    this.selectedTaskIds = /* @__PURE__ */ new Set();
    this.mobileNavOpen = false;
    this.sortPopoverOpen = false;
    this.reviewOpen = false;
    this.reviewActionPending = false;
    this.projectActionsOpen = null;
    this.projectMenuEl = null;
    this.sidebarScrollLeft = 0;
    this.pendingScrollSnapshot = null;
    this.composerCleanup = null;
    this.renderScheduled = false;
    this.handleRootKeyDown = (event) => {
      if (this.reviewOpen && event.key !== "Escape") {
        const target = event.target;
        const isFormField = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
        if (!isFormField) {
          const key = event.key.toLowerCase();
          const step = this.currentReviewStep();
          if (step && (step.kind === "inbox" || step.kind === "date") && /^[1-9]$/.test(event.key)) {
            const sector = this.settings.sectors[Number(event.key) - 1];
            if (sector) {
              this.stopEscape(event);
              if (step.kind === "date") {
                this.runReviewAction(() => this.applyReviewDateAssign(sector.tag));
              } else {
                this.runReviewAction(() => this.applyReviewInboxAction("assign", sector.tag));
              }
              return;
            }
          }
          const hotkeyButton = this.containerEl.querySelector<HTMLButtonElement>(`.belki-review-modal button[data-hotkey="${key}"]`);
          if (hotkeyButton && !hotkeyButton.disabled) {
            this.stopEscape(event);
            hotkeyButton.click();
            return;
          }
        }
      }
      if (event.key !== "Escape") {
        return;
      }
      if (this.mobileNavOpen) {
        this.stopEscape(event);
        this.mobileNavOpen = false;
        this.render();
        return;
      }
      if (this.reviewOpen) {
        this.stopEscape(event);
        this.reviewOpen = false;
        this.render();
        return;
      }
      if (this.projectActionsOpen !== null) {
        this.stopEscape(event);
        this.projectActionsOpen = null;
        this.render();
        return;
      }
      if (this.sortPopoverOpen) {
        this.stopEscape(event);
        this.sortPopoverOpen = false;
        this.render();
        return;
      }
      if (this.searchOpen) {
        this.stopEscape(event);
        this.searchOpen = false;
        this.searchQuery = "";
        this.render();
        return;
      }
      this.stopEscape(event);
    };
  }
  getViewType() {
    return VIEW_TYPE_BELKI;
  }
  getDisplayText() {
    return "Sectors";
  }
  getIcon() {
    return "check-circle-2";
  }
  async onOpen() {
    this.unsubscribe = this.store.subscribe(() => this.renderPreservingMainScroll());
    this.render();
  }
  async onClose() {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    this.containerEl.removeEventListener("keydown", this.handleRootKeyDown, true);
    this.unsubscribe?.();
  }
  removeProjectMenu() {
    this.projectMenuEl?.remove();
    this.projectMenuEl = null;
  }
  refresh() {
    this.render();
  }
  openToday() {
    this.mode = "today";
    this.selectedProject = null;
    this.activeFilter = null;
    this.activeLabel = null;
    this.searchOpen = false;
    this.searchQuery = "";
    this.composerOpen = false;
    this.sortPopoverOpen = false;
    this.projectActionsOpen = null;
    this.render();
  }
  openSearch() {
    this.searchOpen = true;
    this.searchQuery = "";
    this.sortPopoverOpen = false;
    this.selectedTaskIds.clear();
    this.mobileNavOpen = false;
    this.render();
  }
  render() {
    this.composerCleanup?.();
    this.composerCleanup = null;
    this.removeProjectMenu();
    const { containerEl } = this;
    const sidebarScrollLeft = containerEl.querySelector(".belki-sidebar")?.scrollLeft ?? this.sidebarScrollLeft;
    containerEl.empty();
    containerEl.addClass("belki-root");
    containerEl.addClass("belki-view");
    applyBelkiFontSettings(containerEl, this.settings);
    applyBelkiThemeSettings(containerEl, this.settings);
    containerEl.addEventListener("keydown", this.handleRootKeyDown, true);
    const shell = containerEl.createDiv({ cls: "belki-shell" });
    this.renderSidebar(shell);
    this.renderMain(shell);
    if (this.searchOpen) {
      this.renderSearchOverlay(containerEl);
    }
    if (this.reviewOpen) {
      this.renderReviewOverlay(containerEl);
    }
    this.restoreSidebarScroll(sidebarScrollLeft);
  }
  getMainScrollSnapshot() {
    const main = this.containerEl.querySelector(".belki-main");
    if (!main) {
      return null;
    }
    return {
      top: main.scrollTop,
      left: main.scrollLeft
    };
  }
  renderPreservingMainScroll() {
    if (!this.pendingScrollSnapshot) {
      this.pendingScrollSnapshot = this.getMainScrollSnapshot();
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      const snapshot = this.pendingScrollSnapshot;
      this.pendingScrollSnapshot = null;
      this.render();
      if (!snapshot) return;
      window.requestAnimationFrame(() => {
        const main = this.containerEl.querySelector(".belki-main");
        if (main) {
          main.scrollTop = snapshot.top;
          main.scrollLeft = snapshot.left;
        }
      });
    });
  }
  restoreSidebarScroll(scrollLeft: number) {
    window.requestAnimationFrame(() => {
      const sidebar = this.containerEl.querySelector(".belki-sidebar");
      if (!sidebar) {
        return;
      }
      sidebar.scrollLeft = scrollLeft;
      this.sidebarScrollLeft = sidebar.scrollLeft;
    });
  }
  renderSidebar(parent: HTMLElement) {
    const sidebar = parent.createEl("aside", { cls: "belki-sidebar" });
    sidebar.toggleClass("is-mobile-nav-open", this.mobileNavOpen);
    sidebar.scrollLeft = this.sidebarScrollLeft;
    sidebar.addEventListener("scroll", () => {
      this.sidebarScrollLeft = sidebar.scrollLeft;
    });
    const mobileHeader = sidebar.createDiv({ cls: "belki-mobile-header" });
    mobileHeader.createSpan({ cls: "belki-mobile-current-label", text: this.getTitle() });
    const mobileToggle = mobileHeader.createEl("button", {
      cls: "belki-mobile-menu-toggle",
      attr: {
        type: "button",
        "aria-label": this.mobileNavOpen ? "Close menu" : "Open menu",
        "aria-expanded": String(this.mobileNavOpen)
      }
    });
    setIcon(mobileToggle, this.mobileNavOpen ? "x" : "menu");
    mobileToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.mobileNavOpen = !this.mobileNavOpen;
      this.render();
    });
    const content = sidebar.createDiv({ cls: "belki-sidebar-content" });
    const sidebarAdd = content.createEl("button", { cls: "belki-add-sidebar" });
    sidebarAdd.createSpan({ cls: "belki-add-plus", text: "+" });
    sidebarAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
    sidebarAdd.addEventListener("click", () => {
      const sector = this.selectedProject || (SECTOR_SET.has((this.mode || "").toLowerCase()) ? this.mode : "");
      this.mobileNavOpen = false;
      void this.store.createTaskViaModal(sector).then(() => this.render());
    });
    const tasks = this.store.getTasks();
    const active = tasks.filter((task) => !task.completed);
    const nav = content.createDiv({ cls: "belki-nav" });
    this.renderNavButton(nav, "Search", "search", void 0, "search");
    const inboxButton = this.renderNavButton(nav, "Inbox", "inbox", this.getInboxTasks(active).length, "inbox");
    this.enableInboxDrop(inboxButton);
    this.renderNavButton(nav, "Today", "today", this.getTodayTasks(active).length, "today");
    this.renderNavButton(nav, "Upcoming", "upcoming", this.getUpcomingTasks(active).length, "upcoming");
    this.renderNavButton(nav, "Filters & Labels", "filters", void 0, "filters");
    this.renderNavButton(nav, "Sectors", "projects", void 0, "projects");
    const projectsSection = content.createDiv({ cls: "belki-sidebar-section" });
    projectsSection.createDiv({ cls: "belki-sidebar-heading", text: "Sectors" });
    const archivedSet = new Set(this.settings.archivedProjects);
    const activeTasks = active.filter((task) => !archivedSet.has(normalizeTaskProject(task.project) || ""));
    for (const project of this.store.getProjects()) {
      const cleanProject = normalizeTaskProject(project);
      if (!cleanProject || archivedSet.has(cleanProject)) {
        continue;
      }
      const count = activeTasks.filter((task) => normalizeTaskProject(task.project) === cleanProject).length;
      const button = projectsSection.createEl("button", {
        cls: "belki-project-button"
      });
      button.toggleClass(
        "is-active",
        this.mode === "projects" && this.selectedProject === cleanProject
      );
      const color = getProjectColor(cleanProject, this.settings.projectColors);
      button.setCssProps({
        "--belki-project-color": color.regular
      });
      button.createSpan({ cls: "belki-project-dot" }).setCssStyles({ backgroundColor: color.regular });
      button.createSpan({ cls: "belki-nav-label", text: projectDisplayName(cleanProject) });
      button.createSpan({ cls: "belki-count", text: String(count) });
      this.enableProjectDrop(button, cleanProject);
      button.addEventListener("click", () => {
        this.mode = "projects";
        this.selectedProject = cleanProject;
        this.composerOpen = false;
        this.mobileNavOpen = false;
        this.render();
      });
    }
    if (this.settings.archivedProjects.length > 0) {
      const archiveButton = projectsSection.createEl("button", {
        cls: "belki-project-button belki-archived-button"
      });
      archiveButton.toggleClass("is-active", this.mode === "archived");
      archiveButton.createSpan({ cls: "belki-project-dot" });
      archiveButton.createSpan({ cls: "belki-nav-label", text: "Archived" });
      archiveButton.createSpan({ cls: "belki-count", text: String(this.settings.archivedProjects.length) });
      archiveButton.addEventListener("click", () => {
        this.mode = "archived";
        this.selectedProject = null;
        this.composerOpen = false;
        this.mobileNavOpen = false;
        this.render();
      });
    }
    const reviewSection = content.createDiv({ cls: "belki-sidebar-section" });
    reviewSection.createDiv({ cls: "belki-sidebar-heading belki-sidebar-heading-static", text: "Review" });
    this.renderReviewNavButton(reviewSection, "daily");
    this.renderReviewNavButton(reviewSection, "weekly");
    this.renderReviewNavButton(reviewSection, "monthly");
    this.renderNavButton(
      nav,
      "Completed",
      "completed",
      tasks.filter((task) => task.completed || task.completedOccurrences && task.completedOccurrences.length > 0).length,
      "completed"
    );
  }
  renderReviewNavButton(parent: HTMLElement, type: string) {
    const session = this.settings.reviewSession;
    const isActiveSession = session && session.type === type;
    const button = parent.createEl("button", { cls: "belki-project-button" });
    button.createSpan({ cls: "belki-project-dot" });
    const label = isActiveSession ? `Resume ${reviewTypeLabel(type)}` : reviewTypeLabel(type);
    button.createSpan({ cls: "belki-nav-label", text: label });
    const reminderDue = type === "weekly" ? this.settings.lastWeeklyReviewKey !== currentIsoWeekKey() : type === "monthly" ? this.settings.lastMonthlyReviewKey !== currentMonthKey() : false;
    if (reminderDue && !isActiveSession) {
      button.createSpan({
        cls: "belki-review-reminder",
        attr: { "aria-label": type === "weekly" ? "No weekly review completed this week yet" : "No monthly review completed this month yet" }
      });
    }
    if (isActiveSession) {
      const remaining = session.steps.reduce((sum, step, idx) => {
        if (idx < session.stepIndex) return sum;
        if (idx === session.stepIndex) return sum + (step.taskIds.length - session.taskIndex);
        return sum + step.taskIds.length;
      }, 0);
      button.createSpan({ cls: "belki-count", text: String(Math.max(remaining, 0)) });
    }
    button.addEventListener("click", () => {
      this.mobileNavOpen = false;
      if (isActiveSession) {
        this.reviewOpen = true;
        this.render();
        return;
      }
      void this.startReview(type);
    });
  }
  async startReview(type: string) {
    const existing = this.settings.reviewSession;
    if (existing && existing.type !== type) {
      new Notice(
        `${reviewTypeLabel(existing.type)} is still running \u2013 finish it first, or choose "discard" inside the review.`
      );
      this.reviewOpen = true;
      this.render();
      return;
    }
    const tasks = this.store.getTasks();
    const steps = buildReviewSteps(type, this.settings.sectors, tasks);
    if (steps.length === 0) {
      new Notice(`Nothing to review \u2013 ${reviewTypeLabel(type)} is empty.`);
      this.stampReviewCompleted(type);
      await this.saveSettings();
      this.render();
      return;
    }
    this.settings.reviewSession = { type, totalSteps: steps.length, completedSteps: 0, steps, stepIndex: 0, taskIndex: 0 };
    await this.saveSettings();
    this.reviewOpen = true;
    this.render();
  }
  stampReviewCompleted(type: string) {
    if (type === "weekly") {
      this.settings.lastWeeklyReviewKey = currentIsoWeekKey();
    } else if (type === "monthly") {
      this.settings.lastMonthlyReviewKey = currentMonthKey();
      this.settings.lastWeeklyReviewKey = currentIsoWeekKey();
    }
  }
  runReviewAction(action: () => Promise<void>) {
    if (this.reviewActionPending) return;
    this.reviewActionPending = true;
    void action().finally(() => {
      this.reviewActionPending = false;
    });
  }
  currentReviewStep() {
    const session = this.settings.reviewSession;
    if (!session) return null;
    return session.steps[session.stepIndex] || null;
  }
  currentReviewTask() {
    const step = this.currentReviewStep();
    const session = this.settings.reviewSession;
    if (!step || !session) return null;
    const id = step.taskIds[session.taskIndex];
    if (!id) return null;
    return this.store.getTasks().find((t) => t.id === id) || null;
  }
  async advanceReview() {
    const session = this.settings.reviewSession;
    if (!session) return;
    session.taskIndex += 1;
    while (session.stepIndex < session.steps.length && session.taskIndex >= session.steps[session.stepIndex].taskIds.length) {
      session.stepIndex += 1;
      session.taskIndex = 0;
    }
    if (session.stepIndex >= session.steps.length) {
      this.settings.reviewSession = null;
      this.stampReviewCompleted(session.type);
      await this.saveSettings();
      this.reviewOpen = false;
      new Notice(`${reviewTypeLabel(session.type)} complete.`);
      this.render();
      return;
    }
    await this.saveSettings();
    this.render();
  }
  async applyReviewSectorAction(action: string) {
    const step = this.currentReviewStep();
    const task = this.currentReviewTask();
    if (!step || !task) {
      await this.advanceReview();
      return;
    }
    if (action === "stay") {
      await this.advanceReview();
      return;
    }
    if (action === "inbox") {
      await this.store.updateTask(task.id, { project: void 0 });
      await this.advanceReview();
      return;
    }
    const { prev, next } = reviewSectorNeighbors(step.tag, this.settings.sectors, this.settings.reviewSession.type);
    const target = action === "up" ? prev : next;
    if (!target) {
      await this.advanceReview();
      return;
    }
    await this.store.updateTask(task.id, { project: target.tag });
    await this.advanceReview();
  }
  async applyReviewWaitingAction(action: string) {
    const task = this.currentReviewTask();
    if (task && action === "followup") {
      const firstSector = this.settings.sectors[0];
      if (firstSector) {
        await this.store.updateTask(task.id, { project: firstSector.tag });
      }
    }
    await this.advanceReview();
  }
  async applyReviewInboxAction(action: string, sectorTag?: string) {
    const task = this.currentReviewTask();
    if (task && action === "assign" && sectorTag) {
      await this.store.updateTask(task.id, { project: sectorTag });
    }
    await this.advanceReview();
  }
  async applyReviewDateAssign(sectorTag: string) {
    const task = this.currentReviewTask();
    if (task && sectorTag) {
      await this.store.updateTask(task.id, { project: sectorTag });
      await this.store.updateTaskViaModal(task.id);
    }
    await this.advanceReview();
  }
  async applyReviewDateAction(action: string) {
    const task = this.currentReviewTask();
    if (task && action === "reschedule") {
      await this.store.updateTaskViaModal(task.id);
    }
    await this.advanceReview();
  }
  async discardReview() {
    this.settings.reviewSession = null;
    await this.saveSettings();
    this.reviewOpen = false;
    this.render();
  }
  renderNavButton(parent: HTMLElement, label: string, mode: string, count?: number, iconKey?: string) {
    const button = parent.createEl("button", { cls: "belki-nav-button" });
    const active = label === "Search" ? false : label === "Sectors" ? this.mode === "projects" && this.selectedProject === null : this.mode === mode;
    button.toggleClass("is-active", active);
    const iconSpan = button.createSpan({ cls: "belki-nav-icon" });
    if (iconKey && this.settings.icons[iconKey]) {
      setIcon(iconSpan, this.settings.icons[iconKey]);
    }
    button.createSpan({ cls: "belki-nav-label", text: label });
    if (count !== void 0) {
      button.createSpan({ cls: "belki-count", text: String(count) });
    }
    button.addEventListener("click", () => {
      if (label === "Search") {
        this.openSearch();
        return;
      }
      this.mode = mode;
      this.selectedProject = null;
      this.activeFilter = null;
      this.activeLabel = null;
      this.composerOpen = false;
      this.searchOpen = false;
      this.sortPopoverOpen = false;
      this.selectedTaskIds.clear();
      this.mobileNavOpen = false;
      this.render();
    });
    return button;
  }
  renderMain(parent: HTMLElement) {
    const main = parent.createEl("main", { cls: "belki-main" });
    const tasks = this.store.getTasks();
    const active = tasks.filter((task) => !task.completed);
    const visible = this.getVisibleTasks(tasks);
    const header = main.createDiv({ cls: "belki-main-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h1", { text: this.getTitle() });
    titleWrap.createDiv({ cls: "belki-subtitle", text: `${visible.length} task${visible.length === 1 ? "" : "s"}` });
    this.renderSortingControl(header);
    const sections = main.createDiv({ cls: "belki-sections" });
    this.renderTaskSections(sections, tasks);
    const addArea = main.createDiv({ cls: "belki-add-area" });
    const inlineAdd = addArea.createEl("button", { cls: "belki-add-inline" });
    inlineAdd.createSpan({ cls: "belki-add-plus", text: "+" });
    inlineAdd.createSpan({ cls: "belki-add-text", text: "Add task" });
    inlineAdd.addEventListener("click", () => {
      const sector = this.selectedProject || (SECTOR_SET.has((this.mode || "").toLowerCase()) ? this.mode : "");
      void this.store.createTaskViaModal(sector).then(() => this.render());
    });
    if (active.length === 0 && tasks.length === 0) {
      main.createDiv({
        cls: "belki-empty",
        text: `No tasks yet. Add one and Sector Tasks will write it to ${this.store.filePath}.`
      });
    }
  }
  groupTasks(tasks: Task[]) {
    const result = new Map<string, Task[]>();
    if (this.settings.groupBy === "label") {
      const noLabel: Task[] = [];
      for (const task of tasks) {
        if (task.labels.length === 0) {
          noLabel.push(task);
        } else {
          const key = task.labels[0];
          if (!result.has(key)) result.set(key, []);
          result.get(key).push(task);
        }
      }
      if (noLabel.length > 0) result.set("No label", noLabel);
    } else if (this.settings.groupBy === "priority") {
      const order = ["P1", "P2", "P3", "P4", "none"];
      const buckets = new Map<string, Task[]>();
      for (const task of tasks) {
        const p = task.priority || "none";
        if (!buckets.has(p)) buckets.set(p, []);
        buckets.get(p).push(task);
      }
      for (const p of order) {
        if (buckets.has(p) && buckets.get(p).length > 0) {
          const label = p === "none" ? "No priority" : getPriorityLabel(p);
          result.set(label, buckets.get(p));
        }
      }
    }
    return result;
  }
  renderSortingControl(parent: HTMLElement) {
    const wrapper = parent.createDiv({ cls: "belki-sorting" });
    const button = wrapper.createEl("button", {
      cls: "belki-sorting-button",
      attr: {
        type: "button",
        "aria-haspopup": "menu",
        "aria-expanded": String(this.sortPopoverOpen)
      }
    });
    const icon = button.createSpan({ cls: "belki-sorting-icon" });
    setIcon(icon, "arrow-up-down");
    button.createSpan({ text: "Sorting" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sortPopoverOpen = !this.sortPopoverOpen;
      this.render();
    });
    if (!this.sortPopoverOpen) {
      return;
    }
    const popover = wrapper.createDiv({ cls: "belki-sorting-popover" });
    popover.createDiv({ cls: "belki-sorting-title", text: "Sort by" });
    for (const option of SORT_OPTIONS) {
      const item = popover.createEl("button", {
        cls: "belki-sorting-option",
        attr: {
          type: "button",
          role: "menuitemradio",
          "aria-checked": String(this.settings.sortMode === option.mode)
        }
      });
      item.toggleClass("is-active", this.settings.sortMode === option.mode);
      item.createSpan({
        cls: "belki-sorting-check",
        text: this.settings.sortMode === option.mode ? "\u2713" : ""
      });
      item.createSpan({ text: option.label });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.settings.sortMode = option.mode;
        this.sortPopoverOpen = false;
        void (async () => {
          await this.saveSettings();
          this.render();
        })();
      });
    }
    if (this.mode === "projects") {
      popover.createDiv({ cls: "belki-sorting-divider" });
      popover.createDiv({ cls: "belki-sorting-title", text: "Group by" });
      const GROUP_OPTIONS = [
        { label: "None", value: "none" },
        { label: "Label", value: "label" },
        { label: "Priority", value: "priority" }
      ];
      for (const opt of GROUP_OPTIONS) {
        const item = popover.createEl("button", {
          cls: "belki-sorting-option",
          attr: { type: "button", role: "menuitemradio", "aria-checked": String(this.settings.groupBy === opt.value) }
        });
        item.toggleClass("is-active", this.settings.groupBy === opt.value);
        item.createSpan({ cls: "belki-sorting-check", text: this.settings.groupBy === opt.value ? "\u2713" : "" });
        item.createSpan({ text: opt.label });
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.settings.groupBy = opt.value;
          this.sortPopoverOpen = false;
          void (async () => {
            await this.saveSettings();
            this.render();
          })();
        });
      }
    }
  }
  renderTaskSections(parent: HTMLElement, allTasks: Task[]) {
    parent.empty();
    const active = allTasks.filter((task) => !task.completed && !task.parentId);
    if (this.mode === "today") {
      const todayTasks = this.sortTasks(active.filter((task) => isToday(task.due)));
      const todaySection = this.createSection(parent, formatGroupHeader(todayIso()), todayTasks.length);
      this.enableTodayDrop(todaySection);
      this.renderTaskList(todaySection, todayTasks);
      const overdue = this.sortTasks(this.getOverdueTasks(active));
      const hasAnyOverdue = active.some((task) => task.due && task.due < todayIso());
      if (hasAnyOverdue) {
        const section2 = this.createSection(parent, "Overdue", overdue.length, (header) => {
          this.renderOverdueRangeSelect(header);
        });
        this.renderTaskList(section2, overdue);
      }
      return;
    }
    if (this.mode === "upcoming") {
      const groups = groupByDueDate(
        active.filter((task) => isAfterToday(task.due))
      );
      for (const [date, tasks] of groups) {
        const section2 = this.createSection(parent, formatGroupHeader(date), tasks.length);
        this.enableDueDateDrop(section2, date);
        this.renderTaskList(section2, this.sortTasks(tasks));
      }
      if (groups.length === 0) {
        this.renderEmptySection(parent, "No upcoming tasks.");
      }
      return;
    }
    if (this.mode === "projects") {
      const archivedSet = new Set(this.settings.archivedProjects);
      const projects = this.selectedProject ? [this.selectedProject] : uniqueRealProjects([
        ...this.store.getProjects(),
        ...Object.keys(this.settings.projectColors)
      ]).filter((p) => !archivedSet.has(p));
      if (projects.length === 0) {
        this.renderEmptySection(parent, "No projects yet.");
        return;
      }
      for (const project of projects) {
        const projectTasks = this.sortTasks(
          active.filter((task) => normalizeTaskProject(task.project) === project)
        );
        if (this.settings.groupBy === "none") {
          const section2 = this.createSection(parent, projectDisplayName(project), projectTasks.length);
          this.enableProjectDrop(section2, project);
          this.renderTaskList(section2, projectTasks);
        } else {
          const projectSection = this.createSection(parent, projectDisplayName(project), projectTasks.length);
          this.enableProjectDrop(projectSection, project);
          const groups = this.groupTasks(projectTasks);
          for (const [groupName, groupTasks] of groups) {
            const sub = projectSection.createDiv({ cls: "belki-task-group" });
            sub.createDiv({ cls: "belki-task-group-label", text: groupName });
            this.renderTaskList(sub, groupTasks);
          }
        }
      }
      return;
    }
    if (this.mode === "archived") {
      this.renderArchivedProjectsView(parent, allTasks);
      return;
    }
    if (this.mode === "filters") {
      this.renderFiltersAndLabels(parent, allTasks);
      return;
    }
    if (this.mode === "completed") {
      this.renderCompletedView(parent, allTasks);
      return;
    }
    const visible = this.getVisibleTasks(allTasks);
    const headerAction = this.mode === "inbox" ? (header: HTMLElement) => {
      const session = this.settings.reviewSession;
      const isActiveSession = session && session.type === "inbox-only";
      const processButton = header.createEl("button", {
        cls: "belki-button belki-button-primary belki-process-button",
        text: isActiveSession ? "Resume PROCESS" : "PROCESS"
      });
      processButton.disabled = !isActiveSession && visible.length === 0;
      processButton.addEventListener("click", () => {
        if (isActiveSession) {
          this.reviewOpen = true;
          this.render();
          return;
        }
        void this.startReview("inbox-only");
      });
    } : void 0;
    const section = this.createSection(parent, this.getTitle(), visible.length, headerAction);
    this.renderTaskList(section, visible);
  }
  renderCompletedView(parent: HTMLElement, allTasks: Task[]) {
    const archivedSet = new Set(this.settings.archivedProjects);
    const completed = allTasks.filter(
      (task) => !archivedSet.has(normalizeTaskProject(task.project) || "") && task.completed
    );
    if (completed.length === 0) {
      this.renderEmptySection(parent, "No completed tasks yet.");
      return;
    }
    const groups = new Map<string, Task[]>();
    const noDate: Task[] = [];
    for (const task of completed) {
      const date = task.completedDate;
      if (date) {
        if (!groups.has(date)) groups.set(date, []);
        groups.get(date).push(task);
      } else {
        noDate.push(task);
      }
    }
    const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
    for (const date of sortedDates) {
      const tasks = groups.get(date);
      const section = this.createSection(parent, formatCompletedHeader(date), tasks.length);
      this.renderTaskList(section, tasks);
    }
    if (noDate.length > 0) {
      const section = this.createSection(parent, "Earlier", noDate.length);
      this.renderTaskList(section, noDate);
    }
  }
  renderFiltersAndLabels(parent: HTMLElement, allTasks: Task[]) {
    if (this.activeFilter) {
      const definition = this.getFilterDefinitions(allTasks).find(
        (filter) => filter.id === this.activeFilter
      );
      const tasks = definition ? this.sortTasks(definition.tasks) : [];
      const section = this.createSection(parent, (definition == null ? void 0 : definition.name) || "Filter", tasks.length);
      this.renderBackToFilters(section);
      this.renderTaskList(section, tasks);
      return;
    }
    if (this.activeLabel) {
      const label = this.activeLabel;
      const tasks = this.sortTasks(
        allTasks.filter((task) => !task.completed && task.labels.includes(label))
      );
      const section = this.createSection(parent, displayLabel(label), tasks.length);
      this.renderBackToFilters(section);
      this.renderTaskList(section, tasks);
      return;
    }
    const filtersSection = parent.createDiv({ cls: "belki-filter-section" });
    filtersSection.createEl("h2", { text: "My Filters" });
    const filterList = filtersSection.createDiv({ cls: "belki-filter-list" });
    for (const filter of this.getFilterDefinitions(allTasks)) {
      this.renderFilterRow(filterList, filter.name, filter.count, filter.icon, () => {
        this.activeFilter = filter.id;
        this.activeLabel = null;
        this.render();
      });
    }
    const labelsSection = parent.createDiv({ cls: "belki-filter-section" });
    const labelsHeader = labelsSection.createDiv({ cls: "belki-labels-header" });
    labelsHeader.createEl("h2", { text: "Labels" });
    labelsHeader.createEl("button", { cls: "belki-label-add", text: "+", attr: { type: "button" } }).addEventListener("click", () => {
      this.createLabelFromPrompt();
    });
    const labelList = labelsSection.createDiv({ cls: "belki-filter-list" });
    const labels = this.getAllLabels();
    if (labels.length === 0) {
      labelList.createDiv({ cls: "belki-empty belki-empty-small", text: "No labels yet." });
      return;
    }
    for (const label of labels) {
      const count = allTasks.filter((task) => !task.completed && task.labels.includes(label)).length;
      this.renderFilterRow(labelList, displayLabel(label), count, "", () => {
        this.activeLabel = label;
        this.activeFilter = null;
        this.render();
      }, getLabelColor(label, this.settings.labelColors).regular);
    }
  }
  renderBackToFilters(parent: HTMLElement) {
    parent.createEl("button", { cls: "belki-back-button", text: "Back to Filters & Labels" }).addEventListener("click", () => {
      this.activeFilter = null;
      this.activeLabel = null;
      this.render();
    });
  }
  renderFilterRow(parent: HTMLElement, name: string, count: number, icon: string, onClick: () => void, color?: string) {
    const row = parent.createEl("button", { cls: "belki-filter-row", attr: { type: "button" } });
    row.toggleClass("belki-label-row", Boolean(color));
    const dot = row.createSpan({ cls: "belki-filter-dot", text: icon });
    if (color) {
      dot.setText("");
      dot.addClass("belki-label-dot");
      dot.setCssStyles({ backgroundColor: color });
    }
    row.createSpan({ cls: "belki-filter-name", text: name });
    row.createSpan({ cls: "belki-row-count", text: String(count) });
    row.addEventListener("click", onClick);
  }
  createSection(parent: HTMLElement, title: string, count: number, renderHeaderAction?: (header: HTMLElement) => void) {
    const section = parent.createDiv({ cls: "belki-section" });
    const header = section.createDiv({ cls: "belki-section-header" });
    header.createEl("h2", { text: title });
    header.createSpan({ cls: "belki-section-count", text: String(count) });
    renderHeaderAction == null ? void 0 : renderHeaderAction(header);
    return section;
  }
  renderArchivedProjectsView(parent: HTMLElement, allTasks: Task[]) {
    const archivedProjects = this.settings.archivedProjects;
    if (archivedProjects.length === 0) {
      this.renderEmptySection(parent, "No archived projects.");
      return;
    }
    for (const project of archivedProjects) {
      const projectTasks = allTasks.filter(
        (task) => normalizeTaskProject(task.project) === project
      );
      const section = this.createSection(parent, projectDisplayName(project), projectTasks.length, (header) => {
        const badge = header.createSpan({ cls: "belki-archived-badge", text: "Archived" });
        badge.setCssStyles({ marginLeft: "auto" });
        const restoreBtn = header.createEl("button", {
          cls: "belki-button belki-restore-button",
          text: "Restore",
          attr: { type: "button" }
        });
        restoreBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.settings.archivedProjects = this.settings.archivedProjects.filter((p) => p !== project);
          void this.saveSettings().then(() => this.render());
        });
      });
      this.renderTaskList(section, this.sortTasks(projectTasks));
    }
  }
  renderOverdueRangeSelect(parent: HTMLElement) {
    const select = parent.createEl("select", {
      cls: "belki-overdue-range-select",
      attr: {
        "aria-label": "Overdue range"
      }
    });
    for (const range of OVERDUE_RANGES) {
      select.createEl("option", {
        text: overdueRangeLabel(range),
        value: range
      });
    }
    select.value = this.settings.defaultOverdueRange;
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      this.settings.defaultOverdueRange = normalizeOverdueRange(select.value);
      void (async () => {
        await this.saveSettings();
        this.renderPreservingMainScroll();
      })();
    });
  }
  enableTodayDrop(section: HTMLElement) {
    section.addClass("belki-drop-zone");
    section.addEventListener("dragover", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && !isToday(t.due) && isBeforeToday(t.due)
      );
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      section.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    section.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && section.contains(event.relatedTarget)) {
        return;
      }
      section.removeClass("is-drop-target");
    });
    section.addEventListener("drop", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && !isToday(t.due) && isBeforeToday(t.due)
      );
      this.clearDropTargets();
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const ids = movable.map((t) => t.id);
      this.selectedTaskIds.clear();
      void this.store.updateManyTasks(ids, { due: todayIso() });
    });
  }
  enableProjectDrop(button: HTMLElement, project: string) {
    button.addClass("belki-project-drop-zone");
    button.dataset.project = project;
    button.addEventListener("dragover", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && normalizeTaskProject(t.project) !== project
      );
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      button.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    button.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) {
        return;
      }
      button.removeClass("is-drop-target");
    });
    button.addEventListener("drop", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && normalizeTaskProject(t.project) !== project
      );
      this.clearDropTargets();
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const ids = movable.map((t) => t.id);
      this.selectedTaskIds.clear();
      void this.store.updateManyTasks(ids, { project });
    });
  }
  enableInboxDrop(button: HTMLElement) {
    button.addClass("belki-inbox-drop-zone");
    button.addEventListener("dragover", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && normalizeTaskProject(t.project)
      );
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      button.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    button.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) {
        return;
      }
      button.removeClass("is-drop-target");
    });
    button.addEventListener("drop", (event) => {
      const movable = this.getDraggedTasks(event).filter(
        (t) => !t.completed && normalizeTaskProject(t.project)
      );
      this.clearDropTargets();
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const ids = movable.map((t) => t.id);
      this.selectedTaskIds.clear();
      void this.store.updateManyTasks(ids, { project: void 0 });
    });
  }
  enableDueDateDrop(section: HTMLElement, due: string) {
    section.addClass("belki-date-drop-zone");
    section.dataset.due = due;
    section.addEventListener("dragover", (event) => {
      const movable = this.getDraggedTasks(event).filter((t) => !t.completed && t.due !== due);
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      section.addClass("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    section.addEventListener("dragleave", (event) => {
      if (event.relatedTarget instanceof Node && section.contains(event.relatedTarget)) {
        return;
      }
      section.removeClass("is-drop-target");
    });
    section.addEventListener("drop", (event) => {
      const movable = this.getDraggedTasks(event).filter((t) => !t.completed && t.due !== due);
      this.clearDropTargets();
      if (movable.length === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const ids = movable.map((t) => t.id);
      this.selectedTaskIds.clear();
      void this.store.updateManyTasks(ids, { due });
    });
  }
  clearDropTargets() {
    this.containerEl.querySelectorAll(".is-drop-target, .is-drop-available").forEach((element) => {
      element.removeClass("is-drop-target");
      element.removeClass("is-drop-available");
    });
  }
  showDropTargets(tasks: Task[]) {
    this.clearDropTargets();
    const list = (tasks || []).filter((t) => !t.completed);
    if (list.length === 0) return;
    for (const projectTarget of Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(".belki-project-drop-zone")
    )) {
      if (list.some((t) => normalizeTaskProject(t.project) !== projectTarget.dataset.project)) {
        projectTarget.addClass("is-drop-available");
      }
    }
    if (list.some((t) => normalizeTaskProject(t.project))) {
      this.containerEl.querySelector(".belki-inbox-drop-zone")?.addClass("is-drop-available");
    }
    if (list.some((t) => !isToday(t.due) && isBeforeToday(t.due))) {
      this.containerEl.querySelector(".belki-drop-zone")?.addClass("is-drop-available");
    }
    for (const dateTarget of Array.from(
      this.containerEl.querySelectorAll<HTMLElement>(".belki-date-drop-zone")
    )) {
      if (list.some((t) => t.due !== dateTarget.dataset.due)) {
        dateTarget.addClass("is-drop-available");
      }
    }
  }
  createDragImage(row: HTMLElement, count: number) {
    if (count && count > 1) {
      const badge = activeDocument.body.createDiv({ cls: ["belki-drag-preview", "belki-drag-preview-multi"] });
      badge.setText(`${count} tasks`);
      badge.setCssStyles({
        position: "absolute",
        top: "-9999px",
        left: "-9999px"
      });
      return badge;
    }
    const dragImage = row.cloneNode(true) as HTMLElement;
    dragImage.addClass("belki-drag-preview");
    dragImage.setCssStyles({
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      width: `${row.offsetWidth}px`
    });
    activeDocument.body.appendChild(dragImage);
    return dragImage;
  }
  getDraggedTasks(event: DragEvent): Task[] {
    let ids = this.draggedTaskIds;
    if (!ids || ids.length === 0) {
      const fallbackId = this.draggedTaskId || event.dataTransfer?.getData("application/x-belki-task-id") || event.dataTransfer?.getData("text/plain");
      ids = fallbackId ? [fallbackId] : [];
    }
    if (ids.length === 0) {
      return [];
    }
    const byId = new Map(this.store.getTasks().map((task) => [task.id, task]));
    return ids.map((id) => byId.get(id)).filter((task) => task !== void 0);
  }
  toggleTaskSelection(id: string) {
    if (this.selectedTaskIds.has(id)) {
      this.selectedTaskIds.delete(id);
    } else {
      this.selectedTaskIds.add(id);
    }
    this.render();
  }
  hasDragTarget(task: Task) {
    if (task.completed) {
      return false;
    }
    const canMoveToToday = !isToday(task.due) && isBeforeToday(task.due);
    const canMoveToUpcomingDate = this.mode === "upcoming" && this.getUpcomingDropDates().some((date) => date !== task.due);
    const currentProject = normalizeTaskProject(task.project);
    const canMoveToProject = uniqueRealProjects([
      ...this.store.getProjects(),
      ...Object.keys(this.settings.projectColors)
    ]).some((project) => project !== currentProject);
    const canMoveToInbox = Boolean(currentProject);
    return canMoveToToday || canMoveToUpcomingDate || canMoveToProject || canMoveToInbox;
  }
  renderEmptySection(parent: HTMLElement, text: string) {
    const section = parent.createDiv({ cls: "belki-section" });
    section.createDiv({ cls: "belki-empty", text });
  }
  renderTaskList(parent: HTMLElement, tasks: Task[]) {
    const list = parent.createDiv({ cls: "belki-task-list" });
    if (tasks.length === 0) {
      list.createDiv({ cls: "belki-empty belki-empty-small", text: "Nothing here." });
      return;
    }
    for (const task of tasks) {
      this.renderTaskRow(list, task);
    }
  }
  renderTaskRow(parent: HTMLElement, task: Task) {
    const row = parent.createDiv({ cls: "belki-task-row" });
    row.toggleClass("is-completed", task.completed);
    row.toggleClass("is-highlighted", this.highlightedTaskId === task.id);
    row.toggleClass("is-selected", this.selectedTaskIds.has(task.id));
    if (!task.completed) {
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showDueDateMenu(this.store, task, event);
      });
    }
    row.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleTaskSelection(task.id);
        return;
      }
      if (this.selectedTaskIds.size > 0) {
        this.selectedTaskIds.clear();
      }
      this.openTaskDetail(task);
    });
    const dragHandle = row.createEl("button", {
      cls: "belki-task-drag-handle",
      text: "\u22EE\u22EE",
      attr: {
        type: "button",
        "aria-label": `Drag ${task.title}`
      }
    });
    if (task.completed || !this.hasDragTarget(task)) {
      dragHandle.addClass("is-disabled");
      dragHandle.setAttr("disabled", "true");
    } else {
      dragHandle.setAttr("draggable", "true");
      dragHandle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      dragHandle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        const dragIds = this.selectedTaskIds.has(task.id) && this.selectedTaskIds.size > 1 ? Array.from(this.selectedTaskIds) : [task.id];
        this.draggedTaskIds = dragIds;
        this.draggedTaskId = task.id;
        const draggedTasks = this.getDraggedTasks(event);
        const dragImage = this.createDragImage(row, dragIds.length);
        row.addClass("is-dragging");
        event.dataTransfer?.setData("application/x-belki-task-id", task.id);
        event.dataTransfer?.setData("text/plain", task.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setDragImage(dragImage, 24, 24);
        }
        this.showDropTargets(draggedTasks);
        window.setTimeout(() => dragImage.remove(), 0);
      });
      dragHandle.addEventListener("dragend", () => {
        this.draggedTaskId = null;
        this.draggedTaskIds = null;
        row.removeClass("is-dragging");
        this.clearDropTargets();
      });
    }
    const checkbox = row.createEl("button", {
      cls: `belki-task-checkbox ${getPriorityClass(task.priority)}`,
      attr: {
        type: "button",
        "aria-label": task.completed ? "Mark task incomplete" : "Complete task"
      }
    });
    const checkboxPriorityColor = getPriorityColor(task.priority);
    checkbox.setCssProps({
      "--belki-priority-text": checkboxPriorityColor.color,
      "--belki-priority-bg": checkboxPriorityColor.light
    });
    checkbox.toggleClass("is-checked", task.completed);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.store.toggleComplete(task.id);
    });
    const content = row.createDiv({ cls: "belki-task-content" });
    renderLinkedText(task.title, content.createDiv({ cls: "belki-task-title" }), this.app);
    if (task.description) {
      renderLinkedText(task.description, content.createDiv({ cls: "belki-task-description" }), this.app);
    }
    const meta = content.createDiv({ cls: "belki-task-meta" });
    if (task.due) {
      const dateSpan = meta.createSpan({
        cls: `belki-task-date${isBeforeToday(task.due) ? " is-overdue" : ""}`,
        text: formatDueChip(task.due)
      });
      if (task.repeat) {
        const ri = dateSpan.createSpan({ cls: "belki-task-repeat-icon" });
        setIcon(ri, "repeat");
      }
    }
    if (task.deadline) {
      meta.createSpan({
        cls: `belki-task-deadline${isBeforeToday(task.deadline) ? " is-overdue" : ""}`,
        text: `Deadline ${formatShortDate(task.deadline)}`
      });
    }
    if (task.labels.length > 0) {
      for (const label of task.labels) {
        const chip = meta.createSpan({ cls: "belki-task-label", text: displayLabel(label) });
        const labelColor = getLabelColor(label, this.settings.labelColors);
        chip.setCssStyles({
          borderColor: labelColor.light,
          backgroundColor: labelColor.light
        });
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          this.mode = "filters";
          this.activeLabel = label;
          this.activeFilter = null;
          this.selectedProject = null;
          this.render();
        });
      }
    }
    if (task.attachments.length > 0) {
      meta.createSpan({
        cls: "belki-task-attachments",
        text: `\u{1F4CE} ${task.attachments.length}`
      });
    }
    const allTasks = this.store.getTasks();
    const subTasks = allTasks.filter((t) => t.parentId === task.id);
    if (subTasks.length > 0) {
      const done = subTasks.filter((t) => t.completed).length;
      const counterEl = meta.createSpan({ cls: "belki-task-subtask-counter" });
      setIcon(counterEl.createSpan({ cls: "belki-chip-icon" }), "list-checks");
      counterEl.createSpan({ text: `${done}/${subTasks.length}` });
    }
    if (!task.completed && task.completedOccurrences && task.completedOccurrences.length > 0) {
      const last = task.completedOccurrences[task.completedOccurrences.length - 1];
      const lastSpan = meta.createSpan({ cls: "belki-task-last-completed" });
      setIcon(lastSpan.createSpan({ cls: "belki-chip-icon" }), "check");
      lastSpan.createSpan({ text: formatDueChip(last) });
    }
    const project = normalizeTaskProject(task.project);
    if (project) {
      const projectColor = getProjectColor(project, this.settings.projectColors);
      const projectChip = row.createDiv({ cls: "belki-task-project" });
      projectChip.setCssStyles({ backgroundColor: projectColor.light });
      projectChip.createSpan({ cls: "belki-project-dot" }).setCssStyles({ backgroundColor: projectColor.regular });
      projectChip.createSpan({ text: projectDisplayName(project) });
    }
    const actions = row.createDiv({ cls: "belki-task-actions" });
    const backlinkBtn = actions.createEl("button", {
      cls: "belki-task-backlink",
      attr: {
        type: "button",
        "aria-label": "Open task in note"
      }
    });
    setIcon(backlinkBtn, "file-symlink");
    backlinkBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.openTaskInNote(task);
    });
    actions.createEl("button", {
      cls: "belki-task-delete",
      text: "\xD7",
      attr: {
        type: "button",
        "aria-label": "Delete task"
      }
    }).addEventListener("click", (event) => {
      event.stopPropagation();
      void this.store.deleteTask(task.id);
    });
  }
  async openTaskInNote(task: Task) {
    const path = task.sourcePath || this.store.filePath;
    if (!path) {
      new Notice("No source file for this task.");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Source file not found: ${path}`);
      return;
    }
    let line = -1;
    try {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      const needle = `${E_ID} ${task.id}`;
      line = lines.findIndex((l) => l.includes(needle));
    } catch {
      // best-effort: placing the cursor on the task line is optional
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    if (line >= 0) {
      if (leaf.view instanceof MarkdownView) {
        const editor = leaf.view.editor;
        editor.setCursor({ line, ch: 0 });
        editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
      }
    }
  }
  openTaskDetail(task: Task) {
    void this.store.updateTaskViaModal(task.id).then(() => this.renderPreservingMainScroll());
  }
  getVisibleTasks(tasks: Task[]): Task[] {
    const archivedSet = new Set(this.settings.archivedProjects);
    const active = tasks.filter(
      (task) => !task.completed && !archivedSet.has(normalizeTaskProject(task.project) || "") && !task.parentId
    );
    if (this.mode === "inbox") {
      return this.getInboxTasks(active);
    }
    if (this.mode === "today") {
      return this.getTodayTasks(active);
    }
    if (this.mode === "upcoming") {
      return this.getUpcomingTasks(active);
    }
    if (this.mode === "completed") {
      return this.sortTasks(tasks.filter(
        (task) => !archivedSet.has(normalizeTaskProject(task.project) || "") && (task.completed || task.completedOccurrences && task.completedOccurrences.length > 0)
      ));
    }
    if (this.mode === "projects") {
      return this.sortTasks(
        this.selectedProject ? active.filter((task) => normalizeTaskProject(task.project) === this.selectedProject) : active.filter((task) => Boolean(normalizeTaskProject(task.project)))
      );
    }
    if (this.mode === "archived") {
      return [];
    }
    if (this.mode === "filters") {
      if (this.activeFilter) {
        const definition = this.getFilterDefinitions(tasks).find(
          (filter) => filter.id === this.activeFilter
        );
        return definition ? definition.tasks : [];
      }
      if (this.activeLabel) {
        return this.sortTasks(
          active.filter((task) => task.labels.includes(this.activeLabel || ""))
        );
      }
      return [];
    }
    if (this.mode === "search") {
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) {
        return [];
      }
      const searchPool = this.settings.searchExcludeCompleted ? active : tasks;
      return searchPool.filter((task) => searchableText(task).includes(query)).sort((a, b) => this.compareTasks(a, b));
    }
    return this.sortTasks(active);
  }
  getInboxTasks(tasks: Task[]): Task[] {
    return this.sortTasks(
      tasks.filter((task) => !normalizeTaskProject(task.project))
    );
  }
  getTodayTasks(tasks: Task[]): Task[] {
    const today = todayIso();
    return [
      ...tasks.filter((task) => task.due === today),
      ...this.getOverdueTasks(tasks)
    ].sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) {
        return compareIsoDates(b.due, a.due);
      }
      return this.compareTasks(a, b);
    });
  }
  getOverdueTasks(tasks: Task[]): Task[] {
    return tasks.filter((task) => this.isInSelectedOverdueRange(task));
  }
  isInSelectedOverdueRange(task: Task): boolean {
    if (task.completed || !task.due || task.due >= todayIso()) {
      return false;
    }
    if (this.settings.defaultOverdueRange === "yesterday") {
      return task.due === yesterdayIso();
    }
    if (this.settings.defaultOverdueRange === "last7") {
      return task.due >= addDaysIso2(-7);
    }
    if (this.settings.defaultOverdueRange === "last30") {
      return task.due >= addDaysIso2(-30);
    }
    return task.due < addDaysIso2(-30);
  }
  getUpcomingTasks(tasks: Task[]): Task[] {
    return tasks.filter((task) => isAfterToday(task.due)).sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) {
        return compareIsoDates(a.due, b.due);
      }
      return this.compareTasks(a, b);
    });
  }
  getUpcomingDropDates() {
    return [...new Set(
      this.store.getTasks().filter((task) => !task.completed && isAfterToday(task.due)).map((task) => task.due).filter((due) => Boolean(due))
    )].sort(compareIsoDates);
  }
  sortTasks(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => this.compareTasks(a, b));
  }
  compareTasks(a: Task, b: Task): number {
    return compareTasksByMode(a, b, this.settings.sortMode);
  }
  getTitle() {
    if (this.mode === "inbox") {
      return "Inbox";
    }
    if (this.mode === "today") {
      return "Today";
    }
    if (this.mode === "upcoming") {
      return "Upcoming";
    }
    if (this.mode === "projects") {
      return this.selectedProject ? projectDisplayName(this.selectedProject) : "Sectors";
    }
    if (this.mode === "completed") {
      return "Completed";
    }
    if (this.mode === "archived") {
      return "Archived projects";
    }
    if (this.mode === "filters") {
      if (this.activeFilter) {
        return this.getFilterDefinitions(this.store.getTasks()).find(
          (filter) => filter.id === this.activeFilter
        )?.name || "Filters & Labels";
      }
      if (this.activeLabel) {
        return displayLabel(this.activeLabel);
      }
      return "Filters & Labels";
    }
    return "Search";
  }
  getFilterDefinitions(tasks: Task[]) {
    const active = tasks.filter((task) => !task.completed);
    const today = todayIso();
    const definitions = [
      {
        id: "p1",
        name: "Priority 1",
        icon: "1",
        tasks: active.filter((task) => task.priority === "P1")
      },
      {
        id: "p2",
        name: "Priority 2",
        icon: "2",
        tasks: active.filter((task) => task.priority === "P2")
      },
      {
        id: "p3",
        name: "Priority 3",
        icon: "3",
        tasks: active.filter((task) => task.priority === "P3")
      },
      {
        id: "p4",
        name: "Priority 4",
        icon: "4",
        tasks: active.filter((task) => task.priority === "P4")
      },
      {
        id: "all",
        name: "View all",
        icon: "\u2022",
        tasks: active
      },
      {
        id: "no-due",
        name: "No due date",
        icon: "\u25CB",
        tasks: active.filter((task) => !task.due)
      },
      {
        id: "today",
        name: "Today",
        icon: "\u25CF",
        tasks: active.filter((task) => task.due === today)
      },
      {
        id: "overdue",
        name: "Overdue",
        icon: "!",
        tasks: active.filter((task) => task.due && task.due < today)
      },
      {
        id: "with-deadline",
        name: "With deadline",
        icon: "\u25C6",
        tasks: active.filter((task) => Boolean(task.deadline))
      },
      {
        id: "no-label",
        name: "No label",
        icon: "#",
        tasks: active.filter((task) => task.labels.length === 0)
      }
    ];
    return definitions.map((definition) => ({
      ...definition,
      tasks: this.sortTasks(definition.tasks),
      count: definition.tasks.length
    }));
  }
  renderSearchOverlay(parent: HTMLElement) {
    const backdrop = parent.createDiv({ cls: "belki-search-backdrop" });
    const modal = backdrop.createDiv({ cls: "belki-search-modal" });
    const input = modal.createEl("input", {
      cls: "belki-search-input",
      attr: {
        type: "search",
        placeholder: "Search tasks...",
        value: this.searchQuery,
        autofocus: "true"
      }
    });
    const results = modal.createDiv({ cls: "belki-search-results" });
    let matches: Task[] = [];
    let selectedIndex = 0;
    const close = () => {
      this.searchOpen = false;
      this.searchQuery = "";
      this.render();
    };
    const openSelected = () => {
      const selected = matches[selectedIndex];
      if (selected) {
        this.openTaskLocation(selected);
      }
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(matches.length - 1, 0));
        renderResults();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderResults();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openSelected();
      }
    });
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      selectedIndex = 0;
      renderResults();
    });
    const renderResults = () => {
      results.empty();
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) {
        matches = [];
        results.createDiv({ cls: "belki-search-empty", text: "Type to search tasks" });
        return;
      }
      const searchPool = this.settings.searchExcludeCompleted ? this.store.getTasks().filter((task) => !task.completed) : this.store.getTasks();
      matches = searchPool
        .filter((task) => searchableText(task).includes(query))
        .sort((a, b) => Number(a.completed) - Number(b.completed))
        .slice(0, 25);
      selectedIndex = Math.min(selectedIndex, Math.max(matches.length - 1, 0));
      if (matches.length === 0) {
        results.createDiv({ cls: "belki-search-empty", text: "No matching tasks." });
        return;
      }
      for (const [index, task] of matches.entries()) {
        const result = results.createEl("button", { cls: "belki-search-result" });
        result.toggleClass("is-selected", index === selectedIndex);
        result.toggleClass("is-completed", task.completed);
        result.createDiv({ cls: "belki-search-title", text: task.title });
        if (task.description) {
          renderLinkedText(task.description, result.createDiv({ cls: "belki-search-description" }), this.app);
        }
        const meta = result.createDiv({ cls: "belki-search-meta" });
        if (task.completed) {
          meta.createSpan({ cls: "belki-search-completed-badge", text: "Completed" });
        }
        meta.createSpan({ text: projectDisplayName(task.project) });
        if (task.due) {
          meta.createSpan({ text: formatDueChip(task.due) });
        }
        if (task.deadline) {
          meta.createSpan({ text: `Deadline ${formatShortDate(task.deadline)}` });
        }
        for (const label of task.labels) {
          meta.createSpan({ text: displayLabel(label) });
        }
        result.addEventListener("click", () => {
          this.openTaskLocation(task);
        });
      }
    };
    renderResults();
    window.setTimeout(() => input.focus(), 0);
  }
  renderReviewOverlay(parent: HTMLElement) {
    const rawSession = this.settings.reviewSession;
    if (!rawSession) {
      this.reviewOpen = false;
      return;
    }
    const session = pruneReviewSession(rawSession, this.store.getTasks());
    if (session !== rawSession) {
      this.settings.reviewSession = session;
      void this.saveSettings();
    }
    if (!session) {
      this.reviewOpen = false;
      new Notice(`${reviewTypeLabel(rawSession.type)} complete \u2013 no open tasks left.`);
      this.renderPreservingMainScroll();
      return;
    }
    const step = session.steps[session.stepIndex];
    const task = this.store.getTasks().find((t) => t.id === step.taskIds[session.taskIndex]);
    if (!task) {
      return;
    }
    const backdrop = parent.createDiv({ cls: "belki-search-backdrop belki-review-backdrop" });
    const modal = backdrop.createDiv({ cls: "belki-search-modal belki-review-modal" });
    const close = () => {
      this.reviewOpen = false;
      this.render();
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    const header = modal.createDiv({ cls: "belki-review-header" });
    header.createDiv({ cls: "belki-review-title", text: reviewTypeLabel(session.type) });
    const doneInStep = (step.doneTasks || 0) + session.taskIndex;
    const totalInStep = (step.doneTasks || 0) + step.taskIds.length > (step.totalTasks || 0) ? (step.doneTasks || 0) + step.taskIds.length : step.totalTasks;
    header.createDiv({
      cls: "belki-review-progress",
      text: `Step ${session.completedSteps + session.stepIndex + 1}/${session.totalSteps} \u2014 ${step.label} (Task ${doneInStep + 1}/${totalInStep})`
    });
    const closeButton = header.createEl("button", { cls: "belki-review-close", attr: { type: "button", "aria-label": "Close" } });
    setIcon(closeButton, "x");
    closeButton.addEventListener("click", close);
    const card = modal.createDiv({ cls: "belki-review-card" });
    card.createDiv({ cls: "belki-review-task-label", text: "What do I need to do?" });
    const titleButton = card.createDiv({ cls: "belki-review-task-title", text: task.title });
    titleButton.setAttr("role", "button");
    titleButton.setAttr("tabindex", "0");
    titleButton.addEventListener("click", () => {
      void this.store.updateTaskViaModal(task.id).then(() => this.render());
    });
    titleButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void this.store.updateTaskViaModal(task.id).then(() => this.render());
      }
    });
    const meta = card.createDiv({ cls: "belki-review-task-meta" });
    if (step.kind === "date") {
      const currentSector = this.settings.sectors.find((s) => s.tag === task.project);
      meta.createSpan({ cls: "belki-review-sector-chip", text: currentSector ? currentSector.label : "Inbox" });
    }
    if (task.due) meta.createSpan({ text: formatDueChip(task.due) });
    if (task.priority && task.priority !== "none") meta.createSpan({ text: getPriorityLabel(task.priority) });
    for (const label of task.labels) meta.createSpan({ text: displayLabel(label) });
    const withHotkey = (el: HTMLElement, letter: string) => {
      el.setAttribute("data-hotkey", letter);
      el.createSpan({ cls: "belki-hotkey-badge", text: letter.toUpperCase() });
    };
    const taskTools = card.createDiv({ cls: "belki-review-task-tools" });
    const completeButton = taskTools.createEl("button", { cls: "belki-review-tool-button" });
    completeButton.createSpan({ cls: "belki-review-btn-label", text: "\u2713 Done" });
    withHotkey(completeButton, "d");
    completeButton.addEventListener("click", () => {
      this.runReviewAction(() => this.store.toggleComplete(task.id).then(() => this.advanceReview()));
    });
    const deleteButton = taskTools.createEl("button", { cls: "belki-review-tool-button belki-review-tool-danger" });
    const deleteLabel = deleteButton.createSpan({ cls: "belki-review-btn-label", text: "\u{1F5D1} Delete" });
    withHotkey(deleteButton, "x");
    let deletePending = false;
    deleteButton.addEventListener("click", () => {
      if (!deletePending) {
        deletePending = true;
        deleteLabel.setText("Confirm delete");
        return;
      }
      this.runReviewAction(() => this.store.deleteTask(task.id).then(() => this.advanceReview()));
    });
    const actions = modal.createDiv({ cls: "belki-review-actions" });
    if (step.kind === "inbox") {
      if (Platform.isMobile) {
        const row = actions.createDiv({ cls: "belki-review-inbox-row" });
        for (const sector of this.settings.sectors) {
          const sectorButton = row.createEl("button", { cls: "belki-button", text: sector.label });
          sectorButton.addEventListener("click", () => {
            this.runReviewAction(() => this.applyReviewInboxAction("assign", sector.tag));
          });
        }
      } else {
        const hint = this.settings.sectors.slice(0, 9).map((sector, index) => `${index + 1} ${sector.label}`).join(" \u00B7 ");
        actions.createDiv({ cls: "belki-review-hotkey-hint", text: hint });
      }
      const stayButton = actions.createEl("button", { cls: "belki-button" });
      stayButton.createSpan({ cls: "belki-review-btn-label", text: "Leave in Inbox" });
      withHotkey(stayButton, "n");
      stayButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewInboxAction("skip"));
      });
    } else if (step.kind === "waiting") {
      const followupButton = actions.createEl("button", { cls: "belki-button belki-button-primary" });
      followupButton.createSpan({ cls: "belki-review-btn-label", text: "Follow up" });
      withHotkey(followupButton, "f");
      followupButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewWaitingAction("followup"));
      });
      const waitButton = actions.createEl("button", { cls: "belki-button" });
      waitButton.createSpan({ cls: "belki-review-btn-label", text: "Keep waiting" });
      withHotkey(waitButton, "w");
      waitButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewWaitingAction("wait"));
      });
    } else if (step.kind === "date") {
      if (Platform.isMobile) {
        const row = actions.createDiv({ cls: "belki-review-inbox-row" });
        for (const sector of this.settings.sectors) {
          const sectorButton = row.createEl("button", { cls: "belki-button", text: sector.label });
          sectorButton.addEventListener("click", () => {
            this.runReviewAction(() => this.applyReviewDateAssign(sector.tag));
          });
        }
      } else {
        const hint = this.settings.sectors.slice(0, 9).map((sector, index) => `${index + 1} ${sector.label}`).join(" \u00B7 ");
        actions.createDiv({ cls: "belki-review-hotkey-hint", text: hint });
      }
      const rescheduleButton = actions.createEl("button", { cls: "belki-button" });
      rescheduleButton.createSpan({ cls: "belki-review-btn-label", text: "Reschedule" });
      withHotkey(rescheduleButton, "r");
      rescheduleButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewDateAction("reschedule"));
      });
      const stayButton = actions.createEl("button", { cls: "belki-button belki-button-primary" });
      stayButton.createSpan({ cls: "belki-review-btn-label", text: "Next" });
      withHotkey(stayButton, "n");
      stayButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewDateAction("stay"));
      });
    } else {
      const { prev, next } = reviewSectorNeighbors(step.tag, this.settings.sectors, session.type);
      const upButton = actions.createEl("button", { cls: "belki-button" });
      upButton.createSpan({ cls: "belki-review-btn-label", text: prev ? `\u2191 ${prev.label}` : "\u2191" });
      upButton.disabled = !prev;
      withHotkey(upButton, "k");
      upButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewSectorAction("up"));
      });
      const downButton = actions.createEl("button", { cls: "belki-button" });
      downButton.createSpan({ cls: "belki-review-btn-label", text: next ? `\u2193 ${next.label}` : "\u2193" });
      downButton.disabled = !next;
      withHotkey(downButton, "j");
      downButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewSectorAction("down"));
      });
      const inboxButton = actions.createEl("button", { cls: "belki-button" });
      inboxButton.createSpan({ cls: "belki-review-btn-label", text: "Inbox" });
      withHotkey(inboxButton, "i");
      inboxButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewSectorAction("inbox"));
      });
      const stayButton = actions.createEl("button", { cls: "belki-button belki-button-primary" });
      stayButton.createSpan({ cls: "belki-review-btn-label", text: "Next" });
      withHotkey(stayButton, "n");
      stayButton.addEventListener("click", () => {
        this.runReviewAction(() => this.applyReviewSectorAction("stay"));
      });
    }
    const footer = modal.createDiv({ cls: "belki-review-footer" });
    const discardButton = footer.createEl("button", { cls: "belki-review-discard", text: "Discard review" });
    discardButton.addEventListener("click", () => {
      this.runReviewAction(() => this.discardReview());
    });
    modal.tabIndex = -1;
    modal.focus();
  }
  openTaskLocation(task: Task) {
    this.searchOpen = false;
    this.searchQuery = "";
    this.composerOpen = false;
    this.highlightedTaskId = task.id;
    if (task.completed) {
      this.mode = "completed";
      this.selectedProject = null;
    } else if (task.due === todayIso() || this.isInSelectedOverdueRange(task)) {
      this.mode = "today";
      this.selectedProject = null;
    } else if (task.due && isAfterToday(task.due)) {
      this.mode = "upcoming";
      this.selectedProject = null;
    } else if (!normalizeTaskProject(task.project)) {
      this.mode = "inbox";
      this.selectedProject = null;
    } else {
      this.mode = "projects";
      this.selectedProject = normalizeTaskProject(task.project) || null;
    }
    this.render();
  }
  getAllLabels() {
    const labels: string[] = [];
    labels.push(...this.settings.labelRegistry);
    for (const task of this.store.getTasks()) {
      for (const label of task.labels) {
        labels.push(label);
      }
    }
    for (const label of Object.keys(this.settings.labelColors)) {
      labels.push(label);
    }
    return dedupeLabels(labels).sort((a, b) => a.localeCompare(b));
  }
  ensureLabelColor(label: string) {
    const normalized = normalizeLabelName(label);
    if (!normalized || this.settings.labelRegistry.includes(normalized)) {
      return;
    }
    this.settings.labelRegistry = dedupeLabels([
      ...this.settings.labelRegistry,
      normalized
    ]);
    void this.saveSettings();
  }
  createLabelFromPrompt() {
    new LabelPromptModal(this.app, (rawName) => {
      const label = normalizeLabelName(rawName);
      if (!label) {
        return;
      }
      this.settings.labelRegistry = dedupeLabels([
        ...this.settings.labelRegistry,
        label
      ]);
      this.activeLabel = label;
      this.activeFilter = null;
      void (async () => {
        await this.saveSettings();
        this.render();
      })();
    }).open();
  }
  stopEscape(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
};
export class LabelPromptModal extends Modal {
  onSubmit: (value: string) => void;
  constructor(app: App, onSubmit: (value: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("belki-label-prompt");
    contentEl.createEl("h2", { text: "Create label" });
    const input = contentEl.createEl("input", {
      cls: "belki-label-prompt-input",
      attr: {
        type: "text",
        placeholder: "#label"
      }
    });
    const actions = contentEl.createDiv({ cls: "belki-label-prompt-actions" });
    actions.createEl("button", {
      cls: "belki-button",
      text: "Cancel",
      attr: { type: "button" }
    }).addEventListener("click", () => this.close());
    const submitButton = actions.createEl("button", {
      cls: "belki-button belki-button-primary",
      text: "Create",
      attr: { type: "button" }
    });
    const submit = () => {
      this.onSubmit(input.value);
      this.close();
    };
    submitButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
    input.focus();
  }
}
export function byOrder(a: Task, b: Task): number {
  return a.order - b.order;
}
export function compareTasksByMode(a: Task, b: Task, mode: string): number {
  if (mode === "due") {
    return compareOptionalDateAsc(a.due, b.due) || byOrder(a, b);
  }
  if (mode === "priority") {
    return comparePriority(a, b) || compareOptionalDateAsc(a.deadline, b.deadline) || compareOptionalDateAsc(a.due, b.due) || byOrder(a, b);
  }
  if (mode === "deadline") {
    return compareOptionalDateAsc(a.deadline, b.deadline) || byOrder(a, b);
  }
  if (mode === "created") {
    return compareOptionalDateDesc(a.created, b.created) || byOrder(a, b);
  }
  if (mode === "project") {
    return projectDisplayName(a.project).localeCompare(projectDisplayName(b.project)) || compareSmart(a, b);
  }
  if (mode === "alphabetical") {
    return a.title.localeCompare(b.title) || byOrder(a, b);
  }
  return compareSmart(a, b);
}
export function compareSmart(a: Task, b: Task): number {
  return comparePriority(a, b) || compareOptionalDateAsc(a.deadline, b.deadline) || compareOptionalDateAsc(a.due, b.due) || compareOptionalDateAsc(a.created, b.created) || byOrder(a, b);
}
export function comparePriority(a: Task, b: Task): number {
  return priorityRank(a.priority) - priorityRank(b.priority);
}
export function priorityRank(priority: string): number {
  if (priority === "P1") {
    return 0;
  }
  if (priority === "P2") {
    return 1;
  }
  if (priority === "P3") {
    return 2;
  }
  if (priority === "P4") {
    return 3;
  }
  return 4;
}
export function compareOptionalDateAsc(a?: string, b?: string): number {
  if (a && b) {
    return compareIsoDates(a, b);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
}
export function compareOptionalDateDesc(a?: string, b?: string): number {
  if (a && b) {
    return compareIsoDates(b, a);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
}
export function formatDueChip(value: string): string {
  const today = todayIso();
  if (value === today) {
    return "Today";
  }
  if (value === addDaysIso2(-1)) {
    return "Yesterday";
  }
  if (value === addDaysIso2(1)) {
    return "Tomorrow";
  }
  return formatShortDate(value);
}
export function formatGroupHeader(value: string): string {
  const day = formatShortDate(value);
  const weekday = formatWeekday(value);
  if (value === todayIso()) {
    return `${day} - Today - ${weekday}`;
  }
  if (value === addDaysIso2(1)) {
    return `${day} - Tomorrow - ${weekday}`;
  }
  return `${day} - ${weekday}`;
}
export function formatCompletedHeader(date: string): string {
  if (date === todayIso()) return "Today";
  if (date === yesterdayIso()) return "Yesterday";
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(parsed);
}
export function formatShortDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(date);
}
export function formatWeekday(value: string): string {
  const date = parseIsoDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long"
  }).format(date);
}
export function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
export function addDaysIso2(offset: number): string {
  const date = /* @__PURE__ */ new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export function groupByDueDate(tasks: Task[]): [string, Task[]][] {
  const map = new Map<string, Task[]>();
  for (const task of tasks.sort((a, b) => {
    if (a.due && b.due && a.due !== b.due) {
      return compareIsoDates(a.due, b.due);
    }
    return byOrder(a, b);
  })) {
    if (!task.due) {
      continue;
    }
    const group = map.get(task.due) || [];
    group.push(task);
    map.set(task.due, group);
  }
  return [...map.entries()];
}
export function searchableText(task: Task): string {
  return [
    task.title,
    task.description,
    projectDisplayName(task.project),
    ...task.labels
  ].filter(Boolean).join(" ").toLowerCase();
}
