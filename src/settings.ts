import { Notice, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import { colorForName } from "./colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "./labels";
import { projectDisplayName } from "./projects";
import { DEFAULT_SECTORS, SECTOR_TAG_PATTERN, applySectorSettings, isReservedSectorTag, normalizeSectorTag } from "./tasksFormat";
import { FONT_OPTIONS, OVERDUE_RANGES, SORT_MODES } from "./types";

export const DEFAULT_DATA_FOLDER_PATH = "_belki_files";
export const DEFAULT_SETTINGS = {
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
export const OVERDUE_RANGE_LABELS = {
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  older: "Older"
};
export const FONT_OPTION_LABELS = {
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
export const BELKI_FONT_STACKS = {
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
export function normalizeLabelColorMap(colors) {
  const normalizedColors = {};
  for (const [label, color] of Object.entries(colors || {})) {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      continue;
    }
    normalizedColors[normalized] = color;
  }
  return normalizedColors;
}
export function normalizeLabelRegistry(labels) {
  return dedupeLabels(labels || []);
}
export const LUCIDE_ICON_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function normalizeIcons(savedIcons) {
  const result = { ...DEFAULT_SETTINGS.icons };
  for (const key of Object.keys(DEFAULT_SETTINGS.icons)) {
    const value = savedIcons == null ? void 0 : savedIcons[key];
    if (typeof value === "string" && LUCIDE_ICON_NAME_PATTERN.test(value.trim())) {
      result[key] = value.trim();
    }
  }
  return result;
}
export function normalizeDataFolderPath(value) {
  const trimmed = (value || "").trim().replace(/^\/+/, "");
  const normalized = normalizePath(trimmed || DEFAULT_DATA_FOLDER_PATH).replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized || DEFAULT_DATA_FOLDER_PATH;
}
export function normalizeSortMode(value) {
  return SORT_MODES.includes(value) ? value : DEFAULT_SETTINGS.sortMode;
}
export function normalizeOverdueRange(value) {
  return OVERDUE_RANGES.includes(value) ? value : DEFAULT_SETTINGS.defaultOverdueRange;
}
export function normalizeAutoDeleteDays(value) {
  const num = typeof value === "number" ? Math.floor(value) : parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : 0;
}
export function normalizeFontOption(value) {
  return FONT_OPTIONS.includes(value) ? value : "system";
}
export function fontOptionLabel(option) {
  return FONT_OPTION_LABELS[option];
}
export function overdueRangeLabel(range) {
  return OVERDUE_RANGE_LABELS[range];
}
export function fontStackForOption(option) {
  return BELKI_FONT_STACKS[option] || BELKI_FONT_STACKS.system;
}
export const THEME_COLOR_KEYS = [
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
export const THEME_PRESETS = {
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
export const THEME_PRESET_OPTIONS = [
  ["obsidian", "Follow Obsidian theme (default)"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["custom", "Custom colors"]
];
export function normalizeThemePreset(value) {
  return value === "light" || value === "dark" || value === "custom" ? value : "obsidian";
}
export function normalizeThemeColors(raw) {
  const result = {};
  const source = raw && typeof raw === "object" ? raw : {};
  for (const entry of THEME_COLOR_KEYS) {
    const value = typeof source[entry.key] === "string" ? source[entry.key].trim() : "";
    result[entry.key] = value || THEME_PRESETS.light[entry.key];
  }
  return result;
}
export function resolveThemeColors(settings) {
  if (settings.themePreset === "custom") return normalizeThemeColors(settings.themeColors);
  if (settings.themePreset === "light" || settings.themePreset === "dark") {
    return THEME_PRESETS[settings.themePreset];
  }
  return null;
}
export function hexToRgba(hex, alpha) {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!match) return `rgba(224, 62, 62, ${alpha})`;
  const num = parseInt(match[1], 16);
  return `rgba(${num >> 16 & 255}, ${num >> 8 & 255}, ${num & 255}, ${alpha})`;
}
export function applyBelkiThemeSettings(element, settings) {
  const colors = resolveThemeColors(settings);
  const props = {};
  for (const entry of THEME_COLOR_KEYS) {
    props[entry.cssVar] = colors ? colors[entry.key] : "";
  }
  props["--belki-danger-light"] = colors ? hexToRgba(colors.danger, 0.16) : "";
  element.setCssProps(props);
}
export function applyBelkiFontSettings(element, settings) {
  element.setCssProps({
    "--belki-font-ui": fontStackForOption(settings.uiFont),
    "--belki-font-task-title": fontStackForOption(settings.taskTitleFont),
    "--belki-font-task-description": fontStackForOption(settings.taskDescriptionFont),
    "--belki-font-label": fontStackForOption(settings.labelFont)
  });
}
export const BelkiSettingTab = class extends PluginSettingTab {
  [key: string]: any;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    applyBelkiFontSettings(containerEl, this.plugin.settings);
    new Setting(containerEl).setName("Tasks file").setDesc("Path to the Markdown file Sector Tasks reads and writes. All '#task' lines in this file are managed by the plugin.").addText((text) => {
      text.setPlaceholder("Tasks.md").setValue(this.plugin.settings.tasksFilePath).onChange(async (value) => {
        this.plugin.settings.tasksFilePath = value.trim() || DEFAULT_SETTINGS.tasksFilePath;
        await this.plugin.saveSettings();
        await this.plugin.reloadTasks();
        updatePathWarning();
      });
    });
    const pathWarning = containerEl.createDiv({ cls: "belki-path-warning" });
    const updatePathWarning = () => {
      const path = normalizePath(this.plugin.settings.tasksFilePath || DEFAULT_SETTINGS.tasksFilePath);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        pathWarning.removeClass("is-visible");
        pathWarning.setText("");
      } else if (existing) {
        pathWarning.addClass("is-visible");
        pathWarning.setText(`⚠ "${path}" is a folder, not a file. Enter a path ending in a Markdown file, e.g. Tasks.md.`);
      } else {
        pathWarning.addClass("is-visible");
        pathWarning.setText(`⚠ No file found at "${path}". It will be created on the first write — double-check the path if you expected an existing file.`);
      }
    };
    updatePathWarning();
    new Setting(containerEl).setName("Default overdue range").setDesc("Default range used by the Today overdue section.").addDropdown((dropdown) => {
      for (const range of OVERDUE_RANGES) {
        dropdown.addOption(range, overdueRangeLabel(range));
      }
      dropdown.setValue(this.plugin.settings.defaultOverdueRange).onChange(async (value) => {
        this.plugin.settings.defaultOverdueRange = normalizeOverdueRange(value);
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    new Setting(containerEl).setName("Auto-delete completed tasks").setDesc("Permanently delete completed tasks from the file this many days after their completion date (checked once per Obsidian start). 0 disables the cleanup. Completed tasks without a ✅ date are never touched.").addText((text) => {
      text.setPlaceholder("0").setValue(String(this.plugin.settings.autoDeleteCompletedAfterDays || 0)).onChange(async (value) => {
        this.plugin.settings.autoDeleteCompletedAfterDays = normalizeAutoDeleteDays(value.trim());
        await this.plugin.saveSettings();
      });
    });
    new Setting(containerEl).setName("Search excludes completed tasks").setDesc("When on, search only matches open tasks. Completed tasks never show up in results.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.searchExcludeCompleted === true).onChange(async (value) => {
        this.plugin.settings.searchExcludeCompleted = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    new Setting(containerEl).setName("Sectors").setHeading();
    containerEl.createDiv({
      cls: "setting-item-description",
      text: "Tag (written 1:1 as #tag in the file) and display name per sector column. Changing the tag automatically renames already-tagged tasks in the file. Order here determines column order."
    });
    this.plugin.settings.sectors.forEach((sector, index) => {
      this.addSectorSetting(sector, index, this.plugin.settings.sectors.length);
    });
    this.addNewSectorSetting();
    const appearance = containerEl.createEl("details", { cls: "belki-settings-appearance" });
    if (this.appearanceOpen === true) {
      appearance.setAttr("open", "");
    }
    appearance.addEventListener("toggle", () => {
      this.appearanceOpen = appearance.open;
    });
    appearance.createEl("summary", { cls: "belki-settings-appearance-summary", text: "Appearance" });
    appearance.createDiv({
      cls: "setting-item-description",
      text: "Fonts, theme colors, sidebar icons, and project/label colors. Everything here is cosmetic."
    });
    const rootContainer = this.containerEl;
    this.containerEl = appearance;
    try {
      new Setting(appearance).setName("Fonts").setHeading();
      this.addFontSetting(
        "UI Font",
        "Used for sidebar, headings, buttons, settings, and the general interface.",
        "uiFont"
      );
      this.addFontSetting(
        "Task Title Font",
        "Used for task row titles and the task detail title input.",
        "taskTitleFont"
      );
      this.addFontSetting(
        "Label Font",
        "Used for label chip text.",
        "labelFont"
      );
      new Setting(appearance).setName("Theme").setHeading();
      new Setting(appearance).setName("Color scheme").setDesc('"Follow Obsidian theme" uses the active Obsidian theme. "Custom colors" unlocks the color pickers below.').addDropdown((dropdown) => {
        for (const [value, label] of THEME_PRESET_OPTIONS) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(this.plugin.settings.themePreset).onChange(async (value) => {
          const preset = normalizeThemePreset(value);
          if (preset === "custom" && this.plugin.settings.themePreset !== "custom") {
            const base = this.plugin.settings.themePreset === "dark" ? THEME_PRESETS.dark : THEME_PRESETS.light;
            this.plugin.settings.themeColors = { ...base };
          }
          this.plugin.settings.themePreset = preset;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.display();
        });
      });
      if (this.plugin.settings.themePreset === "custom") {
        for (const entry of THEME_COLOR_KEYS) {
          this.addThemeColorSetting(entry);
        }
        new Setting(appearance).setName("Reset").setDesc("Reset custom colors to a preset.").addButton((button) => {
          button.setButtonText("Load light").onClick(async () => {
            this.plugin.settings.themeColors = { ...THEME_PRESETS.light };
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          });
        }).addButton((button) => {
          button.setButtonText("Load dark").onClick(async () => {
            this.plugin.settings.themeColors = { ...THEME_PRESETS.dark };
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.display();
          });
        });
      }
      new Setting(appearance).setName("Sidebar icons").setDesc("Lucide-Icon-Namen (siehe lucide.dev/icons), z. B. \u201Esearch\u201C, \u201Ecalendar-check\u201C.").setHeading();
      this.addIconSetting("Search icon", "search");
      this.addIconSetting("Inbox icon", "inbox");
      this.addIconSetting("Today icon", "today");
      this.addIconSetting("Upcoming icon", "upcoming");
      this.addIconSetting("Filters icon", "filters");
      this.addIconSetting("Projects icon", "projects");
      this.addIconSetting("Completed icon", "completed");
      new Setting(appearance).setName("Project colors").setHeading();
      const projects = this.plugin.getProjectNames();
      if (projects.length === 0) {
        appearance.createDiv({
          cls: "setting-item-description",
          text: "No projects yet. Sector Tasks will generate stable colors when projects appear."
        });
      }
      for (const project of projects) {
        this.addProjectColorSetting(project);
      }
      new Setting(appearance).setName("Label colors").setHeading();
      this.addLabelRegistrySetting();
      const labels = this.plugin.getLabelNames();
      if (labels.length === 0) {
        appearance.createDiv({
          cls: "setting-item-description",
          text: "No labels yet. Add one here or create one from Filters & Labels."
        });
      }
      for (const label of labels) {
        this.addLabelColorSetting(label);
      }
    } finally {
      this.containerEl = rootContainer;
    }
  }
  addIconSetting(name, key) {
    new Setting(this.containerEl).setName(name).addText((text) => {
      text.setValue(this.plugin.settings.icons[key]).onChange(async (value) => {
        const trimmed = value.trim();
        this.plugin.settings.icons[key] = LUCIDE_ICON_NAME_PATTERN.test(trimmed) ? trimmed : DEFAULT_SETTINGS.icons[key];
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
  }
  addThemeColorSetting(entry) {
    new Setting(this.containerEl).setName(entry.label).addColorPicker((picker) => {
      const colors = normalizeThemeColors(this.plugin.settings.themeColors);
      picker.setValue(colors[entry.key]).onChange(async (value) => {
        this.plugin.settings.themeColors = {
          ...normalizeThemeColors(this.plugin.settings.themeColors),
          [entry.key]: value
        };
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
  }
  addSectorSetting(sector, index, total) {
    const setting = new Setting(this.containerEl).setName(`Sector ${index + 1}`);
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
    setting.addExtraButton((button) => {
      button.setIcon("arrow-up").setTooltip("Move up").setDisabled(index === 0).onClick(() => {
        void this.moveSector(index, index - 1);
      });
    });
    setting.addExtraButton((button) => {
      button.setIcon("arrow-down").setTooltip("Move down").setDisabled(index === total - 1).onClick(() => {
        void this.moveSector(index, index + 1);
      });
    });
    setting.addExtraButton((button) => {
      button.setIcon("trash").setTooltip("Remove sector").onClick(() => {
        void this.removeSector(index);
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Save").onClick(() => {
        void this.commitSectorEdit(index, tagValue, labelValue);
      });
    });
    const reviewRow = new Setting(this.containerEl).setName("Include in review").setDesc(sector.isWaiting === true ? 'A "Waiting for" sector is always reviewed as the final step of Weekly and Monthly Review.' : "Which review workflows should list this sector?");
    if (sector.isWaiting !== true) {
      reviewRow.controlEl.createSpan({ text: "Weekly", cls: "belki-inline-toggle-label" });
      reviewRow.addToggle((toggle) => {
        toggle.setTooltip("Include in Weekly Review").setValue(sector.inWeekly === true).onChange(async (value) => {
          sector.inWeekly = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
      reviewRow.controlEl.createSpan({ text: "Monthly", cls: "belki-inline-toggle-label" });
      reviewRow.addToggle((toggle) => {
        toggle.setTooltip("Include in Monthly Review").setValue(sector.inMonthly === true).onChange(async (value) => {
          sector.inMonthly = value;
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
    }
    reviewRow.controlEl.createSpan({ text: 'Waiting for', cls: "belki-inline-toggle-label" });
    reviewRow.addToggle((toggle) => {
      toggle.setTooltip('Treat as "Waiting for" sector (own review step with follow-up/wait instead of up/down)').setValue(sector.isWaiting === true).onChange(async (value) => {
        if (value) {
          for (const other of this.plugin.settings.sectors) {
            other.isWaiting = false;
          }
        }
        sector.isWaiting = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.display();
      });
    });
  }
  addNewSectorSetting() {
    let pendingTag = "";
    let pendingLabel = "";
    new Setting(this.containerEl).setName("Add sector").setDesc("New tag + display name for an additional column.").addText((text) => {
      text.setPlaceholder("tag").onChange((value) => {
        pendingTag = value;
      });
    }).addText((text) => {
      text.setPlaceholder("Display name").onChange((value) => {
        pendingLabel = value;
      });
    }).addButton((button) => {
      button.setButtonText("Add").onClick(() => {
        void this.addSector(pendingTag, pendingLabel);
      });
    });
  }
  async commitSectorEdit(index, rawTag, rawLabel) {
    const sectors = this.plugin.settings.sectors;
    const current = sectors[index];
    if (!current) return;
    const newTag = normalizeSectorTag(rawTag);
    if (!newTag || !SECTOR_TAG_PATTERN.test(newTag)) {
      new Notice("Invalid tag: only letters, numbers, - _ / allowed.");
      this.display();
      return;
    }
    const lower = newTag.toLowerCase();
    if (isReservedSectorTag(lower)) {
      new Notice(`"${newTag}" is reserved and can't be used as a sector tag.`);
      this.display();
      return;
    }
    if (sectors.some((s, i) => i !== index && s.tag.toLowerCase() === lower)) {
      new Notice(`The tag "${newTag}" is already used by another sector.`);
      this.display();
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
    this.display();
  }
  async addSector(rawTag, rawLabel) {
    const tag = normalizeSectorTag(rawTag);
    if (!tag || !SECTOR_TAG_PATTERN.test(tag)) {
      new Notice("Invalid tag: only letters, numbers, - _ / allowed.");
      return;
    }
    const lower = tag.toLowerCase();
    if (isReservedSectorTag(lower)) {
      new Notice(`"${tag}" is reserved.`);
      return;
    }
    if (this.plugin.settings.sectors.some((s) => s.tag.toLowerCase() === lower)) {
      new Notice(`Sector "${tag}" already exists.`);
      return;
    }
    const label = (rawLabel || "").trim() || tag;
    this.plugin.settings.sectors = [...this.plugin.settings.sectors, { tag, label, isWaiting: false, inWeekly: false, inMonthly: false }];
    applySectorSettings(this.plugin.settings.sectors);
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
    this.display();
  }
  async removeSector(index) {
    const sectors = this.plugin.settings.sectors;
    if (sectors.length <= 1) {
      new Notice("At least one sector must remain.");
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
    this.display();
  }
  async moveSector(fromIndex, toIndex) {
    const sectors = [...this.plugin.settings.sectors];
    if (toIndex < 0 || toIndex >= sectors.length) return;
    const [item] = sectors.splice(fromIndex, 1);
    sectors.splice(toIndex, 0, item);
    this.plugin.settings.sectors = sectors;
    applySectorSettings(sectors);
    await this.plugin.saveSettings();
    this.plugin.refreshBelkiViews();
    this.display();
  }
  addFontSetting(name, description, key) {
    new Setting(this.containerEl).setName(name).setDesc(description).addDropdown((dropdown) => {
      for (const option of FONT_OPTIONS) {
        dropdown.addOption(option, fontOptionLabel(option));
      }
      dropdown.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = normalizeFontOption(value);
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.display();
      });
    });
  }
  addProjectColorSetting(project) {
    const automaticColor = colorForName(project).regular;
    const override = this.plugin.settings.projectColors[project];
    new Setting(this.containerEl).setName(projectDisplayName(project)).setDesc(override ? "Custom color override" : "Automatic palette color").addColorPicker((picker) => {
      picker.setValue(override || automaticColor).onChange(async (value) => {
        this.plugin.settings.projectColors[project] = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    }).addButton((button) => {
      button.setButtonText("Reset").onClick(() => {
        void (async () => {
          delete this.plugin.settings.projectColors[project];
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.display();
        })();
      });
    });
  }
  addLabelRegistrySetting() {
    let pendingLabel = "";
    new Setting(this.containerEl).setName("Add label").setDesc("Create a label without assigning it to a task yet.").addText((text) => {
      text.setPlaceholder("#label").onChange((value) => {
        pendingLabel = value;
      });
    }).addButton((button) => {
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
          this.display();
        })();
      });
    });
  }
  addLabelColorSetting(label) {
    const automaticColor = colorForName(label).regular;
    const override = this.plugin.settings.labelColors[label];
    new Setting(this.containerEl).setName(displayLabel(label)).setDesc(override ? "Custom color override" : "Automatic palette color").addColorPicker((picker) => {
      picker.setValue(override || automaticColor).onChange(async (value) => {
        this.plugin.settings.labelColors[label] = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    }).addButton((button) => {
      button.setButtonText("Reset").onClick(() => {
        void (async () => {
          delete this.plugin.settings.labelColors[label];
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
          this.display();
        })();
      });
    });
  }
};
