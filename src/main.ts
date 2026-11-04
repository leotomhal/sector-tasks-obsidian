import { Notice, Plugin, TAbstractFile } from "obsidian";
import type { BelkiSettings } from "./types";
import { TaskBoardView, VIEW_TYPE_BELKI } from "./views/TaskBoardView";
import { TodaySidebarView, VIEW_TYPE_BELKI_TODAY } from "./views/TodaySidebarView";
import { addDaysIso, isIsoDate, todayIso } from "./dateUtils";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { cleanProjectName, uniqueRealProjects } from "./projects";
import { nextOccurrence } from "./repeatUtils";
import { findWaitingSector, normalizeReviewSession } from "./review";
import { reconcileWaitingSince } from "./waiting";
import { entriesForYear, isMissedMilestone, upcomingEntries } from "./planning";
import { formFromRule, ruleFromForm } from "./recurrenceForm";
import { buildReviewSummary, snapshotForReview } from "./reviewSummary";
import { BelkiSettingTab, DEFAULT_SETTINGS, normalizeAutoDeleteDays, normalizeDataFolderPath, normalizeFontOption, normalizeIcons, normalizeLabelColorMap, normalizeLabelRegistry, normalizeOverdueRange, normalizeReviewNotesFolder, normalizeRowLayout, normalizeSortMode, normalizeStartView, normalizeThemeColors, normalizeVisualStyle, normalizeThemePreset, normalizeWaitingHighlightDays, normalizeWaitingSince } from "./settings";
import { bundledReleaseNotes, compareVersions, parseChangelog, releaseNotesSince } from "./changelog";
import { ReleaseNotesModal } from "./views/ReleaseNotesModal";
import { TaskStore, completionUndoPatch, reinsertDeletedTask, snapshotDeletion } from "./taskStore";
import { applySectorSettings, ordinal, ensureSectorInLine, ensureTaskMarker, extractTags, normalizeSectors, parseTaskLine, parseTasksRecurrence, serializeTaskLine, serializeTasksRecurrence } from "./tasksFormat";

export default class BelkiPlugin extends Plugin {
  settings: BelkiSettings;
  store: TaskStore;
  reloadDebounceTimer: number | null = null;
  seedWaitingFromCreated = false;
  async onload() {
    const hadSettings = await this.loadSettings();
    this.store = new TaskStore(this.app, this.settings);
    // Registered before any view subscribes, so views render with the updated record.
    this.store.subscribe(() => this.syncWaitingSince());
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
      id: "show-release-notes",
      name: "Show release notes",
      callback: () => {
        this.openReleaseNotes();
      }
    });
    this.app.workspace.onLayoutReady(() => {
      void this.showReleaseNotesIfUpdated(!hadSettings);
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
        void this.store.createTaskInEditor(void 0).then(() => this.refreshBelkiViews());
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
      id: "undo-last-completion",
      name: "Undo last completed task",
      callback: () => {
        void this.store.undoLastCompletion();
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
  /** Loads settings; returns false when there was no saved data yet (a fresh install). */
  async loadSettings(): Promise<boolean> {
    const raw: unknown = await this.loadData();
    const saved = toSettingsData(raw);
    const next: BelkiSettings = {
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
      rowLayout: normalizeRowLayout(saved == null ? void 0 : saved.rowLayout),
      startView: normalizeStartView(saved == null ? void 0 : saved.startView),
      visualStyle: normalizeVisualStyle(saved == null ? void 0 : saved.visualStyle),
      showReleaseNotes: (saved == null ? void 0 : saved.showReleaseNotes) !== false,
      lastSeenVersion: typeof (saved == null ? void 0 : saved.lastSeenVersion) === "string" ? saved.lastSeenVersion : "",
      reviewSession: normalizeReviewSession(saved == null ? void 0 : saved.reviewSession),
      waitingSince: normalizeWaitingSince(saved == null ? void 0 : saved.waitingSince),
      waitingHighlightDays: normalizeWaitingHighlightDays(saved == null ? void 0 : saved.waitingHighlightDays),
      reviewNotes: (saved == null ? void 0 : saved.reviewNotes) === true,
      planningEnabled: (saved == null ? void 0 : saved.planningEnabled) !== false,
      archivePastPlanning: (saved == null ? void 0 : saved.archivePastPlanning) !== false,
      reviewNotesFolder: normalizeReviewNotesFolder(saved == null ? void 0 : saved.reviewNotesFolder)
    };
    // No record yet (first run with this feature): seed tasks that are already
    // waiting from their created date instead of starting them all at today.
    if (!saved || saved.waitingSince === void 0) this.seedWaitingFromCreated = true;
    if (this.settings) {
      // The store, the views, and the settings tab all hold this object by
      // reference, so a reload has to update it in place, not replace it.
      Object.assign(this.settings, next);
    } else {
      this.settings = next;
    }
    applySectorSettings(this.settings.sectors);
    return raw != null;
  }
  syncWaitingSince() {
    const waiting = findWaitingSector(this.settings.sectors);
    const next = reconcileWaitingSince(
      this.settings.waitingSince,
      this.store.getTasks(),
      waiting ? waiting.tag : null,
      todayIso(),
      this.seedWaitingFromCreated
    );
    if (this.store.getTasks().length > 0) this.seedWaitingFromCreated = false;
    if (!next) return;
    this.settings.waitingSince = next;
    void this.saveSettings();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /**
   * Once per new version, show what changed since the version last seen in
   * this vault. A fresh install shows nothing; it only records the version.
   */
  async showReleaseNotesIfUpdated(freshInstall: boolean) {
    const current = this.manifest.version;
    const lastSeen = this.settings.lastSeenVersion;
    if (lastSeen === current) return;
    // An older copy of the plugin on another synced device: leave the newer
    // record alone, or the newer device would show the same notes again.
    if (lastSeen && compareVersions(current, lastSeen) < 0) return;
    if (!freshInstall && this.settings.showReleaseNotes) {
      const entries = releaseNotesSince(bundledReleaseNotes(), lastSeen, current);
      if (entries.length > 0) new ReleaseNotesModal(this.app, entries).open();
    }
    this.settings.lastSeenVersion = current;
    await this.saveSettings();
  }
  openReleaseNotes() {
    const entries = bundledReleaseNotes();
    const entry = entries.find((e) => e.version === this.manifest.version) || entries[0];
    if (!entry) {
      new Notice("No release notes found.");
      return;
    }
    new ReleaseNotesModal(this.app, [entry]).open();
  }
  // data.json changed outside this app instance, e.g. synced from another
  // device. Without this, the stale in-memory settings would overwrite the
  // synced ones on the next save (a review in progress, renamed sectors, ...).
  async onExternalSettingsChange() {
    await this.loadSettings();
    // Sector tags and the tasks file path both affect how tasks are read.
    await this.reloadTasks();
    this.refreshBelkiViews();
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
  async activateView(open = "start") {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BELKI);
    if (leaves.length > 0) {
      // A board tab restored at startup stays deferred until it is shown, and a
      // deferred leaf's view is a placeholder, not a TaskBoardView. Load it first,
      // or "Open search" would land on the board without opening search.
      await leaves[0].loadIfDeferred();
      const view = leaves[0].view;
      if (view instanceof TaskBoardView) {
        if (open === "search") {
          view.openSearch();
        } else {
          view.openStartView();
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
      if (this.settings.planningEnabled && this.settings.archivePastPlanning) {
        const moved = await this.store.archivePastPlanning(new Date().getFullYear());
        if (moved > 0) new Notice(`Sector Tasks: moved ${moved} planning entr${moved === 1 ? "y" : "ies"} from past years to the archive note.`);
      }
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
  extractTags,
  completionUndoPatch,
  reconcileWaitingSince,
  formFromRule,
  ruleFromForm,
  ordinal,
  TaskStore,
  entriesForYear,
  upcomingEntries,
  isMissedMilestone,
  buildReviewSummary,
  snapshotForReview,
  snapshotDeletion,
  reinsertDeletedTask,
  parseChangelog,
  compareVersions,
  releaseNotesSince
};
