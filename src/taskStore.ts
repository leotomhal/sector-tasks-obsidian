import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type { BelkiSettings, FileBlock, Task } from "./types";
import { formatDueDateChip, todayIso } from "./dateUtils";
import { dedupeLabels } from "./labels";
import { normalizeTaskProject } from "./projects";
import { isRepeatEnded, nextOccurrence } from "./repeatUtils";
import { INBOX_SECTOR, SECTOR_TAGS, ensureSectorInLine, ensureTaskMarker, getTasksApi, hasTaskMarker, isTaskLine, parseTaskLine, serializeTaskLine } from "./tasksFormat";

export class TaskStore {
  app: App;
  settings: BelkiSettings;
  tasks: Task[];
  fileModel: { blocks: FileBlock[] };
  listeners: Set<() => void>;
  warnedStorageIssues: Set<string>;
  writing: boolean;
  lastKnownDiskContent: string | null;
  constructor(app: App, settings: BelkiSettings) {
    this.app = app;
    this.settings = settings;
    this.tasks = [];
    this.fileModel = { blocks: [] };
    this.listeners = /* @__PURE__ */ new Set();
    this.warnedStorageIssues = /* @__PURE__ */ new Set();
    this.writing = false;
    this.lastKnownDiskContent = null;
  }
  get filePath() {
    return normalizePath(this.settings.tasksFilePath || "Tasks.md");
  }
  isCurrentlyWriting(path: string): boolean {
    return this.writing && normalizePath(path) === this.filePath;
  }
  isTaskStorageFile(path: string): boolean {
    return normalizePath(path) === this.filePath;
  }
  getTasks() {
    return this.tasks.map(cloneTask);
  }
  /** "Projects" in the belki UI are time sectors. */
  getProjects() {
    return [...SECTOR_TAGS];
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async load() {
    const file = await this.ensureFile(this.filePath);
    if (!file) {
      this.tasks = [];
      this.fileModel = { blocks: [] };
      this.lastKnownDiskContent = null;
      this.notify();
      return;
    }
    const content = await this.app.vault.read(file);
    this.lastKnownDiskContent = content;
    const { blocks, tasks } = this.parseContent(content);
    this.fileModel = { blocks };
    this.tasks = tasks;
    this.notify();
  }
  async reloadFromDisk() {
    await this.load();
  }
  parseContent(content: string): { blocks: FileBlock[]; tasks: Task[] } {
    const lines = content === "" ? [] : content.split(/\r?\n/);
    const blocks: FileBlock[] = [];
    const tasks: Task[] = [];
    let order = 0;
    for (const line of lines) {
      if (isTaskLine(line) && hasTaskMarker(line)) {
        const parsed = parseTaskLine(line, createId(), order);
        if (parsed) {
          parsed.task.sourcePath = this.filePath;
          tasks.push(parsed.task);
          blocks.push({ type: "task", taskId: parsed.task.id });
          order += 1;
          continue;
        }
      }
      blocks.push({ type: "raw", line });
    }
    return { blocks, tasks };
  }
  async createTask(input: Partial<Task> & { title: string }) {
    const title = input.title.trim();
    if (!title) return;
    const task = {
      id: createId(),
      title,
      completed: false,
      created: todayIso(),
      due: normalizeOptional(input.due),
      deadline: void 0,
      project: normalizeSector(input.project),
      priority: input.priority || "none",
      description: void 0,
      labels: dedupeLabels(input.labels || []),
      attachments: [],
      repeat: input.repeat,
      parentId: void 0,
      extraProperties: [],
      order: this.tasks.length,
      sourcePath: this.filePath
    };
    this.tasks.push(task);
    this.fileModel.blocks.push({ type: "task", taskId: task.id });
    await this.save();
  }
  async createTaskViaModal(sector?: string) {
    const api = getTasksApi(this.app);
    if (!api) {
      new Notice("Tasks plugin not available \u2013 cannot create task.");
      return;
    }
    let line = await api.createTaskLineModal();
    if (!line || !line.trim()) return;
    line = ensureTaskMarker(line.trim());
    line = ensureSectorInLine(line, sector);
    const parsed = parseTaskLine(line, createId(), this.tasks.length);
    if (!parsed) {
      new Notice("Could not parse the task line from the Tasks modal.");
      return;
    }
    const task = { ...parsed.task, sourcePath: this.filePath };
    this.tasks.push(task);
    this.fileModel.blocks.push({ type: "task", taskId: task.id });
    await this.save();
  }
  async updateTaskViaModal(id: string) {
    const api = getTasksApi(this.app);
    if (!api) {
      new Notice("Tasks plugin not available \u2013 cannot edit task.");
      return;
    }
    const current = this.tasks.find((t) => t.id === id);
    if (!current) return;
    const before = serializeTaskLine(current).replace(/^\s*/, "");
    let line = await api.editTaskLineModal(before);
    if (!line || !line.trim()) return;
    line = ensureTaskMarker(line.trim());
    const parsed = parseTaskLine(line, id, current.order);
    if (!parsed) {
      new Notice("Could not parse the edited task line.");
      return;
    }
    const updated = { ...parsed.task, id, order: current.order, sourcePath: this.filePath };
    this.tasks = this.tasks.map((t) => t.id === id ? updated : t);
    await this.save();
  }
  async updateTask(id: string, patch: Partial<Task>) {
    await this.updateManyTasks([id], patch);
  }
  async updateManyTasks(ids: string[], patch: Partial<Task>) {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    let changed = false;
    this.tasks = this.tasks.map((candidate) => {
      if (!idSet.has(candidate.id)) return candidate;
      changed = true;
      return {
        ...candidate,
        ...patch,
        created: "created" in patch ? normalizeOptional(patch.created) : candidate.created,
        due: "due" in patch ? normalizeOptional(patch.due) : candidate.due,
        deadline: void 0,
        project: "project" in patch ? normalizeSector(patch.project) : candidate.project,
        description: void 0,
        labels: "labels" in patch ? dedupeLabels(patch.labels || []) : candidate.labels,
        attachments: [],
        sourcePath: this.filePath
      };
    });
    if (!changed) return;
    await this.save();
  }
  async toggleComplete(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.repeat && !task.completed) {
      const today = todayIso();
      const fromDate = task.repeat.mode === "completedDate" ? today : task.due || today;
      const nextDue = nextOccurrence(task.repeat, fromDate);
      const occurrences = [...task.completedOccurrences || [], today];
      if (isRepeatEnded(task.repeat, occurrences.length, nextDue)) {
        await this.updateTask(id, {
          completedOccurrences: occurrences,
          repeat: void 0,
          completed: true,
          completedDate: today
        });
      } else {
        await this.updateTask(id, { completedOccurrences: occurrences, due: nextDue });
        new Notice(`Recurring task rescheduled to ${formatDueDateChip(nextDue)}`);
      }
      return;
    }
    await this.updateTask(id, {
      completed: !task.completed,
      completedDate: task.completed ? void 0 : todayIso()
    });
  }
  async deleteTask(id: string) {
    await this.deleteManyTasks([id]);
  }
  get archiveFilePath() {
    const p = this.filePath;
    return p.replace(/\.md$/i, "") + " (archive).md";
  }
  async archiveCompletedTasks(tasks: Task[]): Promise<boolean> {
    if (!tasks.length) return false;
    const file = await this.ensureFile(this.archiveFilePath);
    if (!file) return false;
    const lines = tasks.map((t) => serializeTaskLine(t));
    const block = `

## Archived ${todayIso()}
${lines.join("\n")}
`;
    try {
      await this.app.vault.append(file, block);
      return true;
    } catch (error) {
      console.warn("[belki] Could not append to archive file.", error, { path: this.archiveFilePath });
      return false;
    }
  }
  async deleteManyTasks(ids: string[]) {
    const idSet = new Set(ids);
    if (!this.tasks.some((t) => idSet.has(t.id))) return;
    this.tasks = this.tasks.filter((t) => !idSet.has(t.id)).map((t, index) => ({ ...t, order: index }));
    this.fileModel.blocks = this.fileModel.blocks.filter(
      (b) => b.type !== "task" || !idSet.has(b.taskId)
    );
    await this.save();
  }
  /** Move all tasks of one sector to another (UI "rename project"). */
  async renameProject(oldName: string, newName: string) {
    const oldLower = (oldName || "").trim().toLowerCase();
    const newTag = (newName || "").trim();
    this.tasks = this.tasks.map((task) => {
      const current = normalizeTaskProject(task.project);
      return current && current.toLowerCase() === oldLower ? { ...task, project: newTag } : task;
    });
    await this.save();
  }
  async rescheduleOverdueToToday() {
    const today = todayIso();
    let changed = false;
    this.tasks = this.tasks.map((task) => {
      if (!task.completed && task.due && task.due < today) {
        changed = true;
        return { ...task, due: today };
      }
      return task;
    });
    if (changed) await this.save();
  }
  async normalizeLabels() {
    this.tasks = this.tasks.map((task) => ({ ...task, labels: dedupeLabels(task.labels) }));
    await this.save();
  }
  // --- Removed-feature shims (kept for view compatibility) -----------------
  async migrateOldTaskFile() {
    return 0;
  }
  async resetAndSeedDemoData() {
    return 0;
  }
  // --- Persistence ---------------------------------------------------------
  async save() {
    const file = await this.ensureFile(this.filePath);
    if (!file) {
      new Notice("Sector Tasks could not write the tasks file. Check the file path in settings.");
      return;
    }
    const tasksById = new Map(this.tasks.map((t) => [t.id, t]));
    const out = [];
    for (const block of this.fileModel.blocks) {
      if (block.type === "raw") {
        out.push(block.line);
      } else {
        const task = tasksById.get(block.taskId);
        if (task) out.push(serializeTaskLine(task));
      }
    }
    const content = out.join("\n");
    this.writing = true;
    let conflict = false;
    try {
      await this.app.vault.process(file, (diskContent) => {
        if (this.lastKnownDiskContent !== null && diskContent !== this.lastKnownDiskContent) {
          conflict = true;
          return diskContent;
        }
        return content;
      });
    } finally {
      this.writing = false;
    }
    if (conflict) {
      new Notice("Tasks file changed on disk (sync or external edit). Reloaded the latest version \u2014 your last action was not applied, please retry.");
      await this.load();
      return;
    }
    this.lastKnownDiskContent = content;
    const reparsed = this.parseContent(content);
    this.fileModel = { blocks: reparsed.blocks };
    this.tasks = reparsed.tasks;
    this.notify();
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  // --- File helpers --------------------------------------------------------
  async ensureFile(path: string): Promise<TFile | null> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) return existing;
    if (existing) {
      this.warnWrongType(normalizedPath, existing);
      return null;
    }
    const parentReady = await this.ensureParentFolders(normalizedPath);
    if (!parentReady) return null;
    try {
      return await this.app.vault.create(normalizedPath, "");
    } catch (error) {
      const created = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (created instanceof TFile) return created;
      console.warn("[belki] Could not create tasks file.", error, { path: normalizedPath });
      return null;
    }
  }
  async ensureParentFolders(path: string): Promise<boolean> {
    const parts = normalizePath(path).split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) {
        this.warnWrongType(current, existing);
        return false;
      }
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        const after = this.app.vault.getAbstractFileByPath(current);
        const alreadyExists = /already exists/i.test(String((error as Error | null)?.message ?? error));
        if (after instanceof TFolder || alreadyExists) {
          continue;
        }
        console.warn("[belki] Could not create folder.", error, { path: current });
        return false;
      }
    }
    return true;
  }
  warnWrongType(path: string, existing: unknown) {
    const key = `wrong-type:${path}`;
    if (this.warnedStorageIssues.has(key)) return;
    this.warnedStorageIssues.add(key);
    const kind = existing instanceof TFolder ? "folder" : "something";
    new Notice(`Sector Tasks: "${path}" is a ${kind}, not a usable tasks file. Change the path in settings.`);
  }
};
export function normalizeOptional(value?: string): string | undefined {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : void 0;
}
export function normalizeSector(value?: string): string | undefined {
  const v = (value || "").trim();
  if (!v || v === INBOX_SECTOR) return void 0;
  const match = SECTOR_TAGS.find((s) => s.toLowerCase() === v.toLowerCase());
  return match || void 0;
}
export function createId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export function cloneTask(task: Task): Task {
  return {
    ...task,
    labels: [...task.labels],
    attachments: [...task.attachments],
    completedOccurrences: task.completedOccurrences ? [...task.completedOccurrences] : void 0,
    extraProperties: task.extraProperties.map((p) => ({ ...p })),
    repeat: task.repeat ? { ...task.repeat } : void 0
  };
}
