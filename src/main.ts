import { Notice, Plugin, TAbstractFile } from "obsidian";
import type { BelkiSettings } from "./types";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./views/TaskBoardView";
import { TodaySidebarView, VIEW_TYPE_BELKI_TODAY } from "./views/TodaySidebarView";
import { addDaysIso, isIsoDate } from "./dateUtils";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { cleanProjectName, uniqueRealProjects } from "./projects";
import { nextOccurrence } from "./repeatUtils";
import { normalizeReviewSession } from "./review";
import { BelkiSettingTab, DEFAULT_SETTINGS, normalizeAutoDeleteDays, normalizeDataFolderPath, normalizeFontOption, normalizeIcons, normalizeLabelColorMap, normalizeLabelRegistry, normalizeOverdueRange, normalizeSortMode, normalizeThemeColors, normalizeThemePreset } from "./settings";
import { TaskStore } from "./taskStore";
import { applySectorSettings, ensureSectorInLine, ensureTaskMarker, extractTags, getTasksApi, normalizeSectors, parseTaskLine, parseTasksRecurrence, serializeTaskLine, serializeTasksRecurrence } from "./tasksFormat";

export default class BelkiPlugin extends Plugin {
  settings: BelkiSettings;
  store: TaskStore;
  reloadDebounceTimer: number | null = null;
  async onload() {
    await this.loadSettings();
    if (!getTasksApi(this.app)) {
      new Notice(
        "Sector Tasks requires the community plugin \u201CTasks\u201D to be installed and enabled. Task creation and editing will not work until it is active."
      );
    }
    this.store = new TaskStore(this.app, this.settings);
    this.registerView(
      VIEW_TYPE_BELKI,
      (leaf) => new TaskBoardView(leaf, this.store, this.settings, () => this.saveSettings())
    );
    this.registerView(
      VIEW_TYPE_BELKI_TODAY,
      (leaf) => new TodaySidebarView(leaf, this.store, this.settings)
    );
    this.addRibbonIcon("check-circle-2", "Open Sector Tasks", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open",
      name: "Open",
      callback: () => {
        void this.activateView();
      }
    });
    this.addCommand({
      id: "normalize-labels",
      name: "Normalize Labels",
      callback: async () => {
        await this.store.normalizeLabels();
        this.settings.labelColors = normalizeLabelColorMap(this.settings.labelColors);
        this.settings.labelRegistry = normalizeLabelRegistry([
          ...this.settings.labelRegistry,
          ...Object.keys(this.settings.labelColors)
        ]);
        await this.saveSettings();
        new Notice("Sector Tasks labels normalized.");
      }
    });
    this.addCommand({
      id: "quick-add-task",
      name: "Quick add task (Inbox)",
      callback: () => {
        void this.store.createTaskViaModal(void 0).then(() => this.refreshBelkiViews());
      }
    });
    this.addCommand({
      id: "open-today-sidebar",
      name: "Open Today sidebar",
      callback: () => {
        void this.activateTodaySidebar();
      }
    });
    this.addCommand({
      id: "open-search",
      name: "Open search",
      callback: () => {
        void this.activateView("search");
      }
    });
    this.addCommand({
      id: "cleanup-completed-tasks",
      name: "Clean up completed tasks now",
      callback: () => {
        void this.pruneCompletedTasks(true);
      }
    });
    this.addSettingTab(new BelkiSettingTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        void this.refreshIfTaskFile(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        void this.refreshIfTaskFile(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.store.isTaskStorageFile(oldPath) || this.store.isTaskStorageFile(file.path)) {
          this.scheduleReload();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.store.isTaskStorageFile(file.path)) {
          this.scheduleReload();
        }
      })
    );
    void this.initializeStore();
  }
  onunload() {
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer);
    }
  }
  async loadSettings() {
    const saved = toSettingsData(await this.loadData());
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      dataFolderPath: normalizeDataFolderPath(saved == null ? void 0 : saved.dataFolderPath),
      sectors: normalizeSectors(saved == null ? void 0 : saved.sectors),
      icons: normalizeIcons(saved == null ? void 0 : saved.icons),
      projectColors: {
        ...DEFAULT_SETTINGS.projectColors,
        ...saved == null ? void 0 : saved.projectColors
      },
      labelColors: normalizeLabelColorMap({
        ...DEFAULT_SETTINGS.labelColors,
        ...saved == null ? void 0 : saved.labelColors
      }),
      labelRegistry: normalizeLabelRegistry([
        ...DEFAULT_SETTINGS.labelRegistry,
        ...(saved == null ? void 0 : saved.labelRegistry) || [],
        ...Object.keys((saved == null ? void 0 : saved.labelColors) || {})
      ]),
      sortMode: normalizeSortMode(saved == null ? void 0 : saved.sortMode),
      defaultOverdueRange: normalizeOverdueRange(saved == null ? void 0 : saved.defaultOverdueRange),
      autoDeleteCompletedAfterDays: normalizeAutoDeleteDays(saved == null ? void 0 : saved.autoDeleteCompletedAfterDays),
      uiFont: normalizeFontOption(saved == null ? void 0 : saved.uiFont),
      taskTitleFont: normalizeFontOption(saved == null ? void 0 : saved.taskTitleFont),
      taskDescriptionFont: normalizeFontOption(saved == null ? void 0 : saved.taskDescriptionFont),
      labelFont: normalizeFontOption(saved == null ? void 0 : saved.labelFont),
      themePreset: normalizeThemePreset(saved == null ? void 0 : saved.themePreset),
      themeColors: normalizeThemeColors(saved == null ? void 0 : saved.themeColors),
      reviewSession: normalizeReviewSession(saved == null ? void 0 : saved.reviewSession)
    };
    applySectorSettings(this.settings.sectors);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async reloadTasks() {
    try {
      await this.store.reloadFromDisk();
    } catch (error) {
      new Notice("Sector Tasks could not reload task data.");
      console.error(error);
    }
  }
  async pruneCompletedTasks(manual = false) {
    const days = this.settings.autoDeleteCompletedAfterDays;
    if (!Number.isInteger(days) || days <= 0) {
      if (manual) {
        new Notice("Sector Tasks: auto-delete is off. Set a day count in the plugin settings first.");
      }
      return;
    }
    const cutoff = addDaysIso(-days);
    const completed = this.store.getTasks().filter((t) => t.completed);
    const tasks = completed.filter((t) => isIsoDate(t.completedDate) && t.completedDate < cutoff);
    if (!tasks.length) {
      if (manual) {
        const noDate = completed.filter((t) => !isIsoDate(t.completedDate)).length;
        const extra = noDate ? ` (${noDate} completed task${noDate === 1 ? "" : "s"} without a ✅ date are never removed)` : "";
        new Notice(`Sector Tasks: nothing to clean up — no completed tasks older than ${days} days${extra}.`);
      }
      return;
    }
    const archived = await this.store.archiveCompletedTasks(tasks);
    if (!archived) {
      new Notice("Sector Tasks: could not write the archive file — kept completed tasks to avoid data loss.");
      return;
    }
    await this.store.deleteManyTasks(tasks.map((t) => t.id));
    this.refreshBelkiViews();
    new Notice(`Sector Tasks: archived and removed ${tasks.length} completed task${tasks.length === 1 ? "" : "s"} older than ${days} days.`);
  }
  refreshBelkiViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI)) {
      const view = leaf.view;
      if (view instanceof TaskBoardView) {
        view.refresh();
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI_TODAY)) {
      const view = leaf.view;
      if (view instanceof TodaySidebarView) {
        view.refresh();
      }
    }
  }
  async activateTodaySidebar() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI_TODAY);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_BELKI_TODAY, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }
  getProjectNames() {
    return uniqueRealProjects([
      ...this.store.getProjects().map(cleanProjectName),
      ...Object.keys(this.settings.projectColors).map(cleanProjectName)
    ]);
  }
  getLabelNames() {
    const taskLabels = this.store.getTasks().flatMap((task) => task.labels);
    return dedupeLabels([
      ...this.settings.labelRegistry,
      ...Object.keys(this.settings.labelColors),
      ...taskLabels
    ]).sort((a, b) => a.localeCompare(b));
  }
  async activateView(open = "today") {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI);
    if (leaves.length > 0) {
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        if (open === "search") {
          view.openSearch();
        } else {
          view.openToday();
        }
      }
      this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BELKI, active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (open === "search") {
      const view = leaf.view;
      if (view instanceof TaskBoardView) {
        view.openSearch();
      }
    }
  }
  scheduleReload() {
    if (this.reloadDebounceTimer !== null) {
      window.clearTimeout(this.reloadDebounceTimer);
    }
    this.reloadDebounceTimer = window.setTimeout(() => {
      this.reloadDebounceTimer = null;
      void this.reloadTasks();
    }, 300);
  }
  refreshIfTaskFile(file: TAbstractFile) {
    if (!this.store.isTaskStorageFile(file.path)) return;
    if (this.store.isCurrentlyWriting(file.path)) return;
    this.scheduleReload();
  }
  async initializeStore() {
    try {
      await this.store.load();
      await this.pruneCompletedTasks();
    } catch (error) {
      new Notice("Sector Tasks could not initialize task storage. Open the developer console for details.");
      console.error("[belki] Failed to initialize task storage.", error, {
        dataFolderPath: this.settings.dataFolderPath,
        tasksFilePath: this.settings.tasksFilePath
      });
    }
  }
};
export function toSettingsData(value: unknown): Partial<BelkiSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

// Pure helpers exposed for the test suite as a named export. Obsidian only
// reads the default export (the plugin class), so this has no runtime effect.
export const __testables = {
  parseTaskLine,
  serializeTaskLine,
  ensureTaskMarker,
  ensureSectorInLine,
  parseTasksRecurrence,
  serializeTasksRecurrence,
  nextOccurrence,
  normalizeLabelName,
  extractTags
};
