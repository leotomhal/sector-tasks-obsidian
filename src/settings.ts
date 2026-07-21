import { App, Notice, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type { BelkiSettings, SectorConfig } from "./types";
import type BelkiPlugin from "./main";
import { colorForName } from "./colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "./labels";
import { projectDisplayName } from "./projects";
import { DEFAULT_SECTORS, SECTOR_TAG_PATTERN, applySectorSettings, isReservedSectorTag, normalizeSectorTag } from "./tasksFormat";
import { FONT_OPTIONS, OVERDUE_RANGES, SORT_MODES } from "./types";

export const DEFAULT_DATA_FOLDER_PATH = "_belki_files";
export const DEFAULT_SETTINGS: BelkiSettings = {
  tasksFilePath: "Tasks.md",
  dataFolderPath: DEFAULT_DATA_FOLDER_PATH,
  sectors: DEFAULT_SECTORS.map((s) => ({ ...s })),
  icons: {
    search: "search",
    inbox: "inbox",
    today: "calendar-check",
    upcoming: "calendar-days",
    filters: "tag",
    projects: "kanban",
    completed: "list-check"
  },
  projectColors: {},
  labelColors: {},
  labelRegistry: [],
  archivedProjects: [],
  sortMode: "smart",
  groupBy: "none",
  defaultOverdueRange: "last7",
  uiFont: "system",
  taskTitleFont: "system",
  taskDescriptionFont: "system",
  labelFont: "system",
  themePreset: "obsidian",
  themeColors: {},
  reviewSession: null,
  autoDeleteCompletedAfterDays: 0,
  searchExcludeCompleted: false,
  lastWeeklyReviewKey: "",
  lastMonthlyReviewKey: ""
};
export const OVERDUE_RANGE_LABELS: Record<string, string> = {
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  older: "Older"
};
export const FONT_OPTION_LABELS: Record<string, string> = {
  system: "System Font",
  ibmPlexSans: "IBM Plex Sans",
  ibmPlexMono: "IBM Plex Mono",
  spaceGrotesk: "Space Grotesk",
  spaceMono: "Space Mono",
  manrope: "Manrope",
  jetBrainsMono: "JetBrains Mono",
  sourceSans3: "Source Sans 3",
  inter: "Inter",
  geistMono: "Geist Mono",
  dmSans: "DM Sans"
};
export const BELKI_FONT_STACKS: Record<string, string> = {
  system: 'var(--font-interface), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ibmPlexSans: '"IBM Plex Sans", var(--font-interface), system-ui, sans-serif',
  ibmPlexMono: '"IBM Plex Mono", var(--font-monospace), monospace',
  spaceGrotesk: '"Space Grotesk", var(--font-interface), system-ui, sans-serif',
  spaceMono: '"Space Mono", var(--font-monospace), monospace',
  manrope: '"Manrope", var(--font-interface), system-ui, sans-serif',
  jetBrainsMono: '"JetBrains Mono", var(--font-monospace), monospace',
  sourceSans3: '"Source Sans 3", var(--font-interface), system-ui, sans-serif',
  inter: '"Inter", var(--font-interface), system-ui, sans-serif',
  geistMono: '"Geist Mono", var(--font-monospace), monospace',
  dmSans: '"DM Sans", var(--font-interface), system-ui, sans-serif'
};
export function normalizeLabelColorMap(colors?: Record<string, string>): Record<string, string> {
  const normalizedColors: Record<string, string> = {};
  for (const [label, color] of Object.entries(colors || {})) {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      continue;
    }
    normalizedColors[normalized] = color;
  }
  return normalizedColors;
}
export function normalizeLabelRegistry(labels?: string[]): string[] {
  return dedupeLabels(labels || []);
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function normalizeIcons(savedIcons?: Record<string, string>): Record<string, string> {
  const result = { ...DEFAULT_SETTINGS.icons };
  for (const key of Object.keys(DEFAULT_SETTINGS.icons)) {
    const value = savedIcons == null ? void 0 : savedIcons[key];
    if (typeof value === "string" && LUCIDE_ICON_NAME_PATTERN.test(value.trim())) {
      result[key] = value.trim();
    }
  }
  return result;
}
export function normalizeDataFolderPath(value?: string): string {
  const trimmed = (value || "").trim().replace(/^\/+/, "");
  const normalized = normalizePath(trimmed || DEFAULT_DATA_FOLDER_PATH).replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized || DEFAULT_DATA_FOLDER_PATH;
}
export function normalizeSortMode(value?: string): string {
  return SORT_MODES.includes(value) ? value : DEFAULT_SETTINGS.sortMode;
}
export function normalizeOverdueRange(value?: string): string {
  return OVERDUE_RANGES.includes(value) ? value : DEFAULT_SETTINGS.defaultOverdueRange;
}
export function normalizeAutoDeleteDays(value?: number | string): number {
  const num = typeof value === "number" ? Math.floor(value) : parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : 0;
}
export function normalizeFontOption(value?: string): string {
  return FONT_OPTIONS.includes(value) ? value : "system";
}
export function fontOptionLabel(option: string): string {
  return FONT_OPTION_LABELS[option];
}
export function overdueRangeLabel(range: string): string {
  return OVERDUE_RANGE_LABELS[range];
}
export function fontStackForOption(option?: string): string {
  return BELKI_FONT_STACKS[option] || BELKI_FONT_STACKS.system;
}
export const THEME_COLOR_KEYS: { key: string; cssVar: string; label: string }[] = [
  { key: "bg", cssVar: "--belki-bg", label: "Background" },
  { key: "surface", cssVar: "--belki-surface", label: "Surfaces (modals, chips)" },
  { key: "sidebarBg", cssVar: "--belki-sidebar-bg", label: "Sidebar background" },
  { key: "hover", cssVar: "--belki-hover", label: "Hover" },
  { key: "border", cssVar: "--belki-border", label: "Border" },
  { key: "borderSoft", cssVar: "--belki-border-soft", label: "Border (soft)" },
  { key: "text", cssVar: "--belki-text", label: "Text" },
  { key: "muted", cssVar: "--belki-muted", label: "Muted text" },
  { key: "faint", cssVar: "--belki-faint", label: "Text (faint)" },
  { key: "accent", cssVar: "--belki-accent", label: "Accent" },
  { key: "accentHover", cssVar: "--belki-accent-hover", label: "Accent (hover)" },
  { key: "onAccent", cssVar: "--belki-on-accent", label: "Text on accent" },
  { key: "danger", cssVar: "--belki-danger", label: "Danger / delete" },
  { key: "chipBg", cssVar: "--belki-chip-bg", label: "Chip background" }
];
export const THEME_PRESETS: Record<string, Record<string, string>> = {
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    sidebarBg: "#f7f7f5",
    hover: "#f1f1ef",
    border: "#ebeced",
    borderSoft: "#ebeced",
    text: "#37352f",
    muted: "#787774",
    faint: "#a8a6a1",
    accent: "#37352f",
    accentHover: "#2f2e2a",
    onAccent: "#ffffff",
    danger: "#e03e3e",
    chipBg: "#f7f7f5"
  },
  dark: {
    bg: "#1e1e1e",
    surface: "#262626",
    sidebarBg: "#232323",
    hover: "#2f2f2f",
    border: "#3d3d3d",
    borderSoft: "#333333",
    text: "#dadada",
    muted: "#9b9b9b",
    faint: "#6e6e6e",
    accent: "#dadada",
    accentHover: "#f2f2f2",
    onAccent: "#1e1e1e",
    danger: "#e03e3e",
    chipBg: "#2a2a2a"
  }
};
export const THEME_PRESET_OPTIONS: [string, string][] = [
  ["obsidian", "Follow Obsidian theme (default)"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["custom", "Custom colors"]
];
export function normalizeThemePreset(value?: string): string {
  return value === "light" || value === "dark" || value === "custom" ? value : "obsidian";
}
export function normalizeThemeColors(raw?: Record<string, string> | null): Record<string, string> {
  const result: Record<string, string> = {};
  const source: Record<string, string> = raw && typeof raw === "object" ? raw : {};
  for (const entry of THEME_COLOR_KEYS) {
    const value = typeof source[entry.key] === "string" ? source[entry.key].trim() : "";
    result[entry.key] = value || THEME_PRESETS.light[entry.key];
  }
  return result;
}
export function resolveThemeColors(settings: BelkiSettings): Record<string, string> | null {
  if (settings.themePreset === "custom") return normalizeThemeColors(settings.themeColors);
  if (settings.themePreset === "light" || settings.themePreset === "dark") {
    return THEME_PRESETS[settings.themePreset];
  }
  return null;
}
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!match) return `rgba(224, 62, 62, ${alpha})`;
  const num = parseInt(match[1], 16);
  return `rgba(${num >> 16 & 255}, ${num >> 8 & 255}, ${num & 255}, ${alpha})`;
}
export function applyBelkiThemeSettings(element: HTMLElement, settings: BelkiSettings) {
  const colors = resolveThemeColors(settings);
  const props: Record<string, string> = {};
  for (const entry of THEME_COLOR_KEYS) {
    props[entry.cssVar] = colors ? colors[entry.key] : "";
  }
  props["--belki-danger-light"] = colors ? hexToRgba(colors.danger, 0.16) : "";
  element.setCssProps(props);
}
export function applyBelkiFontSettings(element: HTMLElement, settings: BelkiSettings) {
  element.setCssProps({
    "--belki-font-ui": fontStackForOption(settings.uiFont),
    "--belki-font-task-title": fontStackForOption(settings.taskTitleFont),
    "--belki-font-task-description": fontStackForOption(settings.taskDescriptionFont),
    "--belki-font-label": fontStackForOption(settings.labelFont)
  });
}
export class BelkiSettingTab extends PluginSettingTab {
  plugin: BelkiPlugin;
  constructor(app: App, plugin: BelkiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Tasks file",
        desc: "Path to the Markdown file Sector Tasks reads and writes. All '#task' lines in this file are managed by the plugin. If the file does not exist yet, it is created on the first write.",
        control: {
          type: "text",
          key: "tasksFilePath",
          placeholder: "Tasks.md",
          validate: (value: string) => this.validateTasksFilePath(value)
        }
      },
      {
        name: "Default overdue range",
        desc: "Default range used by the Today overdue section.",
        control: { type: "dropdown", key: "defaultOverdueRange", options: OVERDUE_RANGE_LABELS }
      },
      {
        name: "Auto-delete completed tasks",
        desc: "Permanently delete completed tasks from the file this many days after their completion date (checked once per Obsidian start). 0 disables the cleanup. Completed tasks without a \u2705 date are never touched.",
        control: { type: "number", key: "autoDeleteCompletedAfterDays", min: 0, step: 1, placeholder: "0" }
      },
      {
        name: "Search excludes completed tasks",
        desc: "When on, search only matches open tasks. Completed tasks never show up in results.",
        control: { type: "toggle", key: "searchExcludeCompleted" }
      },
      {
        name: "",
        desc: "Sectors: the tag is written 1:1 as #tag in the tasks file; changing a tag automatically renames already-tagged tasks. Drag rows to change the column order on the board.",
        searchable: false
      },
      this.buildSectorList(),
      this.buildAppearancePage()
    ];
  }
  getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    if (key.startsWith("icons.")) {
      return settings.icons[key.slice("icons.".length)];
    }
    if (key.startsWith("themeColors.")) {
      return normalizeThemeColors(settings.themeColors)[key.slice("themeColors.".length)];
    }
    return (settings as unknown as Record<string, unknown>)[key];
  }
  setControlValue(key: string, value: unknown): Promise<void> {
    return this.applyControlValue(key, value);
  }
  async applyControlValue(key: string, value: unknown) {
    const settings = this.plugin.settings;
    if (key === "tasksFilePath") {
      settings.tasksFilePath = asString(value).trim() || DEFAULT_SETTINGS.tasksFilePath;
      await this.plugin.saveSettings();
      await this.plugin.reloadTasks();
      this.plugin.refreshBelkiViews();
      return;
    }
    if (key === "defaultOverdueRange") {
      settings.defaultOverdueRange = normalizeOverdueRange(asString(value));
    } else if (key === "autoDeleteCompletedAfterDays") {
      settings.autoDeleteCompletedAfterDays = normalizeAutoDeleteDays(value as number);
    } else if (key === "searchExcludeCompleted") {
      settings.searchExcludeCompleted = value === true;
    } else if (key === "uiFont" || key === "taskTitleFont" || key === "taskDescriptionFont" || key === "labelFont") {
      settings[key] = normalizeFontOption(asString(value));
    } else if (key === "themePreset") {
      const preset = normalizeThemePreset(asString(value));
      if (preset === "custom" && settings.themePreset !== "custom") {
        const base = settings.themePreset === "dark" ? THEME_PRESETS.dark : THEME_PRESETS.light;
        settings.themeColors = { ...base };
      }
      settings.themePreset = preset;
      await this.plugin.saveSettings();
      this.plugin.refreshBelkiViews();
      this.update();
      return;
    } else if (key.startsWith("themeColors.")) {
      settings.themeColors = {
        ...normalizeThemeColors(settings.themeColors),
        [key.slice("themeColors.".length)]: asString(value)
      };
    } else if (key.startsWith("icons.")) {
      const iconKey = key.slice("icons.".length);
      const trimmed = asString(value).trim();
      settings.icons[iconKey] = LUCIDE_ICON_NAME_PATTERN.test(trimmed) ? trimmed : DEFAULT_SETTINGS.icons[iconKey];
    }
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
  }
  validateTasksFilePath(value: string): string | void {
    const path = normalizePath((value || "").trim() || DEFAULT_SETTINGS.tasksFilePath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && !(existing instanceof TFile)) {
      return `"${path}" is a folder, not a file. Enter a path ending in a Markdown file, e.g. Tasks.md.`;
    }
  }
  buildSectorList(): SettingDefinitionItem {
    return {
      type: "list",
      heading: "Sectors",
      emptyState: "No sectors configured.",
      onReorder: (oldIndex: number, newIndex: number) => {
        void this.moveSector(oldIndex, newIndex);
      },
      onDelete: (index: number) => {
        void this.removeSector(index);
      },
      addItem: {
        name: "Add sector",
        action: () => {
          void this.addSectorPlaceholder();
        }
      },
      items: this.plugin.settings.sectors.map((sector, index) => ({
        name: `#${sector.tag}`,
        desc: sector.isWaiting === true ? 'A "waiting for" sector is always reviewed as the final step of weekly and monthly review.' : 'Toggles: include in weekly review \u00b7 include in monthly review \u00b7 treat as "waiting for".',
        render: (setting: Setting) => this.renderSectorRow(setting, sector, index)
      }))
    };
  }
  renderSectorRow(setting: Setting, sector: SectorConfig, index: number) {
    let tagValue = sector.tag;
    let labelValue = sector.label;
    setting.addText((text) => {
      text.setPlaceholder("tag").setValue(sector.tag).onChange((value) => {
        tagValue = value;
      });
    });
    setting.addText((text) => {
      text.setPlaceholder("Display name").setValue(sector.label).onChange((value) => {
        labelValue = value;
      });
    });
    if (sector.isWaiting !== true) {
      setting.addToggle((toggle) => {
        toggle.setTooltip("Include in weekly review").setValue(sector.inWeekly === true).onChange(async (value) => {
          sector.inWeekly = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
      setting.addToggle((toggle) => {
        toggle.setTooltip("Include in monthly review").setValue(sector.inMonthly === true).onChange(async (value) => {
          sector.inMonthly = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
    }
    setting.addToggle((toggle) => {
      toggle.setTooltip('Treat as "waiting for" sector (own review step with follow-up/wait instead of up/down)').setValue(sector.isWaiting === true).onChange(async (value) => {
        if (value) {
          for (const other of this.plugin.settings.sectors) {
            other.isWaiting = false;
          }
        }
        sector.isWaiting = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.update();
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Save").setTooltip("Save tag and display name").onClick(() => {
        void this.commitSectorEdit(index, tagValue, labelValue);
      });
    });
  }
  async addSectorPlaceholder() {
    const sectors = this.plugin.settings.sectors;
    const base = "new-sector";
    let tag = base;
    let counter = 2;
    while (isReservedSectorTag(tag) || sectors.some((s) => s.tag.toLowerCase() === tag)) {
      tag = `${base}-${counter}`;
      counter += 1;
    }
    this.plugin.settings.sectors = [...sectors, { tag, label: "New sector", isWaiting: false, inWeekly: false, inMonthly: false }];
    applySectorSettings(this.plugin.settings.sectors);
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
    this.update();
  }
  async commitSectorEdit(index: number, rawTag: string, rawLabel: string) {
    const sectors = this.plugin.settings.sectors;
    const current = sectors[index];
    if (!current) return;
    const newTag = normalizeSectorTag(rawTag);
    if (!newTag || !SECTOR_TAG_PATTERN.test(newTag)) {
      new Notice("Invalid tag: only letters, numbers, - _ / allowed.");
      this.update();
      return;
    }
    const lower = newTag.toLowerCase();
    if (isReservedSectorTag(lower)) {
      new Notice(`"${newTag}" is reserved and can't be used as a sector tag.`);
      this.update();
      return;
    }
    if (sectors.some((s, i) => i !== index && s.tag.toLowerCase() === lower)) {
      new Notice(`The tag "${newTag}" is already used by another sector.`);
      this.update();
      return;
    }
    const newLabel = (rawLabel || "").trim() || newTag;
    const oldTag = current.tag;
    const tagChanged = oldTag.toLowerCase() !== lower;
    sectors[index] = {
      tag: newTag,
      label: newLabel,
      isWaiting: current.isWaiting === true,
      inWeekly: current.inWeekly === true,
      inMonthly: current.inMonthly === true
    };
    applySectorSettings(sectors);
    if (tagChanged) {
      await this.plugin.store.renameProject(oldTag, newTag);
      const colorOverride = this.plugin.settings.projectColors[oldTag];
      if (colorOverride) {
        this.plugin.settings.projectColors[newTag] = colorOverride;
        delete this.plugin.settings.projectColors[oldTag];
      }
      this.plugin.settings.archivedProjects = this.plugin.settings.archivedProjects.map(
        (p) => p.toLowerCase() === oldTag.toLowerCase() ? newTag : p
      );
    }
    await this.plugin.saveSettings();
    if (tagChanged) {
      await this.plugin.reloadTasks();
    }
    this.plugin.refreshBelkiViews();
    new Notice(tagChanged ? `Sector renamed: #${oldTag} \u2192 #${newTag} (file updated)` : "Sector updated.");
    this.update();
  }
  async removeSector(index: number) {
    const sectors = this.plugin.settings.sectors;
    if (sectors.length <= 1) {
      new Notice("At least one sector must remain.");
      this.update();
      return;
    }
    const removed = sectors[index];
    if (!removed) return;
    this.plugin.settings.sectors = sectors.filter((_, i) => i !== index);
    applySectorSettings(this.plugin.settings.sectors);
    await this.plugin.saveSettings();
    await this.plugin.reloadTasks();
    this.plugin.refreshBelkiViews();
    new Notice(`Sector "${removed.label}" removed. Existing tasks with #${removed.tag} are kept but no longer shown as their own column (the tag becomes a plain label).`);
    this.update();
  }
  async moveSector(fromIndex: number, toIndex: number) {
    const sectors = [...this.plugin.settings.sectors];
    if (toIndex < 0 || toIndex >= sectors.length) return;
    const [item] = sectors.splice(fromIndex, 1);
    sectors.splice(toIndex, 0, item);
    this.plugin.settings.sectors = sectors;
    applySectorSettings(sectors);
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
    this.update();
  }
  buildAppearancePage(): SettingDefinitionItem {
    const projects = this.plugin.getProjectNames();
    const labels = this.plugin.getLabelNames();
    const fontOptions: Record<string, string> = {};
    for (const option of FONT_OPTIONS) {
      fontOptions[option] = fontOptionLabel(option);
    }
    const customVisible = () => this.plugin.settings.themePreset === "custom";
    const themePresetOptions: Record<string, string> = {};
    for (const [value, label] of THEME_PRESET_OPTIONS) {
      themePresetOptions[value] = label;
    }
    const iconRows: [string, string][] = [
      ["Search icon", "search"],
      ["Inbox icon", "inbox"],
      ["Today icon", "today"],
      ["Upcoming icon", "upcoming"],
      ["Filters icon", "filters"],
      ["Projects icon", "projects"],
      ["Completed icon", "completed"]
    ];
    const projectItems: SettingGroupItem[] = projects.length === 0 ? [{
      name: "",
      desc: "No projects yet. Sector Tasks will generate stable colors when projects appear.",
      searchable: false
    }] : projects.map((project) => ({
      name: projectDisplayName(project),
      render: (setting: Setting) => this.renderProjectColorRow(setting, project)
    }));
    const labelItems: SettingGroupItem[] = [
      {
        name: "Add label",
        desc: "Create a label without assigning it to a task yet.",
        render: (setting: Setting) => this.renderAddLabelRow(setting)
      },
      ...labels.length === 0 ? [{
        name: "",
        desc: "No labels yet. Add one here or create one from Filters & Labels.",
        searchable: false
      } as SettingGroupItem] : labels.map((label): SettingGroupItem => ({
        name: displayLabel(label),
        render: (setting: Setting) => this.renderLabelColorRow(setting, label)
      }))
    ];
    return {
      type: "page",
      name: "Appearance",
      desc: "Fonts, theme colors, sidebar icons, and project/label colors. Everything here is cosmetic.",
      items: [
        {
          type: "group",
          heading: "Fonts",
          items: [
            {
              name: "UI font",
              desc: "Used for sidebar, headings, buttons, settings, and the general interface.",
              control: { type: "dropdown", key: "uiFont", options: fontOptions }
            },
            {
              name: "Task title font",
              desc: "Used for task row titles and the task detail title input.",
              control: { type: "dropdown", key: "taskTitleFont", options: fontOptions }
            },
            {
              name: "Label font",
              desc: "Used for label chip text.",
              control: { type: "dropdown", key: "labelFont", options: fontOptions }
            }
          ]
        },
        {
          type: "group",
          heading: "Theme",
          items: [
            {
              name: "Color scheme",
              desc: '"Follow Obsidian theme" uses the active Obsidian theme. "Custom colors" unlocks the color pickers below.',
              control: { type: "dropdown", key: "themePreset", options: themePresetOptions }
            },
            ...THEME_COLOR_KEYS.map((entry): SettingGroupItem => ({
              name: entry.label,
              visible: customVisible,
              control: { type: "color", key: `themeColors.${entry.key}` }
            })),
            {
              name: "Reset",
              desc: "Reset custom colors to a preset.",
              visible: customVisible,
              render: (setting: Setting) => {
                setting.addButton((button) => {
                  button.setButtonText("Load light").onClick(() => {
                    void this.loadThemePreset("light");
                  });
                });
                setting.addButton((button) => {
                  button.setButtonText("Load dark").onClick(() => {
                    void this.loadThemePreset("dark");
                  });
                });
              }
            }
          ]
        },
        {
          type: "group",
          heading: "Sidebar icons",
          items: iconRows.map(([name, key]): SettingGroupItem => ({
            name,
            desc: 'Lucide icon name (see lucide.dev/icons), e.g. "calendar-check".',
            control: {
              type: "text",
              key: `icons.${key}`,
              validate: (value: string) => LUCIDE_ICON_NAME_PATTERN.test(value.trim()) ? void 0 : "Not a valid Lucide icon name (lowercase words separated by hyphens)."
            }
          }))
        },
        { type: "group", heading: "Project colors", items: projectItems },
        { type: "group", heading: "Label colors", items: labelItems }
      ]
    };
  }
  async loadThemePreset(preset: "light" | "dark") {
    this.plugin.settings.themeColors = { ...THEME_PRESETS[preset] };
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
    this.update();
  }
  renderProjectColorRow(setting: Setting, project: string) {
    const automaticColor = colorForName(project).regular;
    const override = this.plugin.settings.projectColors[project];
    setting.setDesc(override ? "Custom color override" : "Automatic palette color");
    setting.addColorPicker((picker) => {
      picker.setValue(override || automaticColor).onChange(async (value) => {
        this.plugin.settings.projectColors[project] = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Reset").onClick(() => {
        void (async () => {
          delete this.plugin.settings.projectColors[project];
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.update();
        })();
      });
    });
  }
  renderAddLabelRow(setting: Setting) {
    let pendingLabel = "";
    setting.addText((text) => {
      text.setPlaceholder("#label").onChange((value) => {
        pendingLabel = value;
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Add").onClick(() => {
        void (async () => {
          const label = normalizeLabelName(pendingLabel);
          if (!label) {
            return;
          }
          this.plugin.settings.labelRegistry = dedupeLabels([
            ...this.plugin.settings.labelRegistry,
            label
          ]);
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.update();
        })();
      });
    });
  }
  renderLabelColorRow(setting: Setting, label: string) {
    const automaticColor = colorForName(label).regular;
    const override = this.plugin.settings.labelColors[label];
    setting.setDesc(override ? "Custom color override" : "Automatic palette color");
    setting.addColorPicker((picker) => {
      picker.setValue(override || automaticColor).onChange(async (value) => {
        this.plugin.settings.labelColors[label] = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Reset").onClick(() => {
        void (async () => {
          delete this.plugin.settings.labelColors[label];
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.update();
        })();
      });
    });
  }
}
