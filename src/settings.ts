import { App, Notice, PluginSettingTab, Setting, TFile, normalizePath, requireApiVersion } from "obsidian";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type { BelkiSettings, CalendarFeed, SectorConfig, TimeBlock } from "./types";
import type BelkiPlugin from "./main";
import { colorForName } from "./colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "./labels";
import { projectDisplayName } from "./projects";
import { DEFAULT_SECTORS, SECTOR_TAG_PATTERN, applySectorSettings, isReservedSectorTag, normalizeSectorTag } from "./tasksFormat";
import { FONT_OPTIONS, OVERDUE_RANGES, SORT_MODES } from "./types";
import { confirmAction } from "./views/ConfirmModal";

export const DEFAULT_DATA_FOLDER_PATH = "_belki_files";
export const DEFAULT_SETTINGS: BelkiSettings = {
  tasksFilePath: "Tasks.md",
  dataFolderPath: DEFAULT_DATA_FOLDER_PATH,
  sectors: DEFAULT_SECTORS.map((s) => ({ ...s })),
  icons: {
    search: "search",
    overview: "layout-dashboard",
    inbox: "inbox",
    today: "calendar-check",
    upcoming: "calendar-days",
    filters: "tag",
    projects: "kanban",
    completed: "list-check",
    year: "calendar-range"
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
  rowLayout: "stacked",
  startView: "today",
  visualStyle: "default",
  showReleaseNotes: true,
  lastSeenVersion: "",
  waitingSince: {},
  waitingHighlightDays: 7,
  sectorSince: {},
  stuckWeeks: 3,
  reviewNotes: false,
  focusSection: false,
  calendarsEnabled: false,
  calendars: [],
  calendarRefreshMinutes: 30,
  timeBlocking: false,
  dayStartHour: 8,
  dayEndHour: 18,
  timeBlocks: { date: "", blocks: [] },
  planningEnabled: true,
  archivePastPlanning: true,
  reviewNotesFolder: "Reviews",
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
export function normalizeWaitingHighlightDays(value?: number | string): number {
  if (value === void 0 || value === null || value === "") return DEFAULT_SETTINGS.waitingHighlightDays;
  return normalizeAutoDeleteDays(value);
}
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export function normalizeCalendars(value?: unknown): CalendarFeed[] {
  if (!Array.isArray(value)) return [];
  const out: CalendarFeed[] = [];
  const seen = new Set<string>();
  for (const raw of value as Partial<CalendarFeed>[]) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && raw.id ? raw.id : `cal-${Math.random().toString(36).slice(2, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Calendar",
      url: typeof raw.url === "string" ? raw.url.trim() : "",
      color: typeof raw.color === "string" && HEX_COLOR.test(raw.color) ? raw.color : "#3d6a8c",
      enabled: raw.enabled !== false,
      inYearPlan: raw.inYearPlan === true
    });
  }
  return out;
}
export function normalizeHour(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? Math.floor(value) : typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 24 ? n : fallback;
}
export function normalizeTimeBlocks(value: unknown): { date: string; blocks: TimeBlock[] } {
  const raw = value as { date?: unknown; blocks?: unknown } | null;
  if (!raw || typeof raw.date !== "string" || !Array.isArray(raw.blocks)) return { date: "", blocks: [] };
  const blocks = (raw.blocks as Partial<TimeBlock>[]).filter((b) =>
    b && typeof b.taskId === "string" && Number.isInteger(b.start) && Number.isInteger(b.duration) && b.duration > 0 && b.start >= 0 && b.start < 1440
  ) as TimeBlock[];
  return { date: raw.date, blocks };
}
export function normalizeStuckWeeks(value?: number | string): number {
  if (value === void 0 || value === null || value === "") return DEFAULT_SETTINGS.stuckWeeks;
  return normalizeAutoDeleteDays(value);
}
export function normalizeSectorSince(value?: unknown): Record<string, { sector: string; since: string }> {
  const out: Record<string, { sector: string; since: string }> = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const e = entry as { sector?: unknown; since?: unknown } | null;
    if (e && typeof e.sector === "string" && typeof e.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.since)) {
      out[id] = { sector: e.sector, since: e.since };
    }
  }
  return out;
}
export function normalizeWaitingSince(value?: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, date] of Object.entries(value as Record<string, unknown>)) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) out[id] = date;
  }
  return out;
}
export function normalizeReviewNotesFolder(value?: string): string {
  const trimmed = (value || "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? normalizePath(trimmed) : DEFAULT_SETTINGS.reviewNotesFolder;
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
export function normalizeRowLayout(value?: string): string {
  return value === "singleLine" ? value : "stacked";
}
export const START_VIEW_LABELS: Record<string, string> = {
  overview: "Overview",
  today: "Today",
  inbox: "Inbox",
  upcoming: "Upcoming"
};
export const VISUAL_STYLE_LABELS: Record<string, string> = {
  default: "Default",
  editorial: "Editorial"
};
export function normalizeVisualStyle(value?: string): string {
  return value === "editorial" ? value : "default";
}
export function normalizeStartView(value?: string): string {
  return value !== undefined && Object.prototype.hasOwnProperty.call(START_VIEW_LABELS, value) ? value : "today";
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
function taskCount(n: number): string {
  return n === 1 ? "1 task" : `${n} tasks`;
}
export class BelkiSettingTab extends PluginSettingTab {
  plugin: BelkiPlugin;
  appearanceOpen?: boolean;
  sectorsOpen?: boolean;
  calendarsOpen?: boolean;
  constructor(app: App, plugin: BelkiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  // Re-render helper that works on every supported Obsidian version:
  // update() only exists since 1.13; older versions re-run the imperative fallback.
  rerender() {
    if (requireApiVersion("1.13.0")) {
      this.update();
    } else {
      this.renderLegacyTab();
    }
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
        name: "Start view",
        desc: "Which view the board opens on when you open it from the ribbon, the command palette, or the sidebar.",
        control: { type: "dropdown", key: "startView", options: START_VIEW_LABELS }
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
        name: "Show release notes after updates",
        desc: "After the plugin updates, show what changed. The command palette can open them again any time.",
        control: { type: "toggle", key: "showReleaseNotes" }
      },
      {
        name: "Search excludes completed tasks",
        desc: "When on, search only matches open tasks. Completed tasks never show up in results.",
        control: { type: "toggle", key: "searchExcludeCompleted" }
      },
      {
        name: "Time blocking in today",
        desc: "A timeline next to the today view. Drag a task onto a time, or right-click it and choose a time. Blocks are kept for that day only and never written to your tasks file.",
        control: { type: "toggle", key: "timeBlocking" }
      },
      {
        name: "Day starts at",
        desc: "First hour on the timeline (0–23).",
        visible: () => this.plugin.settings.timeBlocking === true,
        control: { type: "number", key: "dayStartHour", min: 0, max: 23, step: 1, placeholder: "8" }
      },
      {
        name: "Day ends at",
        desc: "Last hour on the timeline (1–24).",
        visible: () => this.plugin.settings.timeBlocking === true,
        control: { type: "number", key: "dayEndHour", min: 1, max: 24, step: 1, placeholder: "18" }
      },
      {
        name: "Focus in today (2+8)",
        desc: "Lists priority 1 tasks (the must-dos, up to 2) and priority 2 tasks (up to 8 more) at the top of the today view, from any sector and whatever their date. The count turns red when there are more.",
        control: { type: "toggle", key: "focusSection" }
      },
      {
        name: "Year plan",
        desc: "Appointments and milestones tagged #planning, shown by quarter and next to your tasks. Turning it off hides them everywhere; #planning lines stay in your file untouched and never show up as tasks.",
        control: { type: "toggle", key: "planningEnabled" }
      },
      {
        name: "Archive past years' planning",
        desc: "Once a year is over, move its year-plan entries from the tasks file to the archive note. The year plan still shows them, read-only.",
        visible: () => this.plugin.settings.planningEnabled !== false,
        control: { type: "toggle", key: "archivePastPlanning" }
      },
      {
        name: "Write a review summary note",
        desc: "After a weekly or monthly review, write a note with what you finished, what moved, what's new, and what you're waiting for.",
        control: { type: "toggle", key: "reviewNotes" }
      },
      {
        name: "Review notes folder",
        desc: "Where review summary notes are saved. The folder is created when needed.",
        visible: () => this.plugin.settings.reviewNotes === true,
        control: { type: "text", key: "reviewNotesFolder", placeholder: "Reviews" }
      },
      this.buildSectorsPage(),
      this.buildCalendarsPage(),
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
    } else if (key === "rowLayout") {
      settings.rowLayout = normalizeRowLayout(asString(value));
    } else if (key === "startView") {
      settings.startView = normalizeStartView(asString(value));
    } else if (key === "visualStyle") {
      settings.visualStyle = normalizeVisualStyle(asString(value));
    } else if (key === "showReleaseNotes") {
      settings.showReleaseNotes = value === true;
    } else if (key === "focusSection") {
      settings.focusSection = value === true;
    } else if (key === "timeBlocking") {
      settings.timeBlocking = value === true;
      await this.plugin.saveSettings();
      this.plugin.refreshBelkiViews();
      this.rerender();
      return;
    } else if (key === "dayStartHour" || key === "dayEndHour") {
      const hour = normalizeHour(value, key === "dayStartHour" ? 8 : 18);
      settings[key] = key === "dayStartHour" ? Math.min(hour, 23) : Math.max(hour, 1);
    } else if (key === "calendarsEnabled") {
      settings.calendarsEnabled = value === true;
      await this.plugin.saveSettings();
      if (settings.calendarsEnabled) void this.plugin.calendar.refresh();
      this.plugin.refreshBelkiViews();
      this.rerender();
      return;
    } else if (key === "calendarRefreshMinutes") {
      settings.calendarRefreshMinutes = Math.max(5, normalizeAutoDeleteDays(value as number) || 30);
    } else if (key === "planningEnabled") {
      settings.planningEnabled = value === true;
      await this.plugin.saveSettings();
      this.plugin.refreshBelkiViews();
      this.rerender();
      return;
    } else if (key === "archivePastPlanning") {
      settings.archivePastPlanning = value === true;
    } else if (key === "stuckWeeks") {
      settings.stuckWeeks = normalizeAutoDeleteDays(value as number);
    } else if (key === "waitingHighlightDays") {
      settings.waitingHighlightDays = normalizeAutoDeleteDays(value as number);
    } else if (key === "reviewNotesFolder") {
      settings.reviewNotesFolder = normalizeReviewNotesFolder(asString(value));
    } else if (key === "reviewNotes") {
      settings.reviewNotes = value === true;
      await this.plugin.saveSettings();
      this.rerender();
      return;
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
      this.rerender();
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
    if (this.app.vault.getFolderByPath(path)) {
      return `"${path}" is a folder, not a file. Enter a path ending in a Markdown file, e.g. Tasks.md.`;
    }
  }
  buildCalendarsPage(): SettingDefinitionItem {
    const settings = this.plugin.settings;
    return {
      type: "page",
      name: "Calendars",
      desc: "Show events from Google Calendar or any other iCal calendar next to your tasks. Read-only: nothing is written back.",
      displayValue: () => (settings.calendarsEnabled ? `${settings.calendars.length} calendar${settings.calendars.length === 1 ? "" : "s"}` : "Off"),
      items: [
        {
          name: "Show calendars",
          desc: "Events appear in the day plan on the today view, in upcoming, in the today sidebar and, for calendars you choose, in the year plan.",
          control: { type: "toggle", key: "calendarsEnabled" }
        },
        {
          name: "Refresh every (minutes)",
          desc: "How often calendars are fetched again. The command \"Refresh calendars\" fetches them right away.",
          visible: () => settings.calendarsEnabled === true,
          control: { type: "number", key: "calendarRefreshMinutes", min: 5, step: 5, placeholder: "30" }
        },
        {
          name: "",
          desc: "Use the calendar's secret address in iCal format. In Google Calendar: settings of the calendar → integrate calendar → secret address in iCal format. Anyone with this address can read the calendar; it is stored in the plugin's data and synced with it.",
          searchable: false,
          visible: () => settings.calendarsEnabled === true
        },
        {
          type: "list",
          heading: "Calendars",
          emptyState: "No calendars yet.",
          visible: () => settings.calendarsEnabled === true,
          onDelete: (index: number) => {
            void this.removeCalendar(index);
          },
          addItem: {
            name: "Add calendar",
            action: () => {
              void this.addCalendar();
            }
          },
          items: settings.calendars.map((feed, index) => ({
            name: feed.name,
            desc: this.calendarStatus(feed),
            render: (setting: Setting) => this.renderCalendarRow(setting, feed, index)
          }))
        }
      ]
    };
  }
  calendarStatus(feed: CalendarFeed): string {
    const state = this.plugin.calendar.feeds.get(feed.id);
    if (!feed.url) return "Paste the secret iCal address, then save.";
    if (state?.error) return `Couldn't load: ${state.error}`;
    if (state?.fetchedAt) return `${state.events.length} events loaded`;
    return "Not loaded yet.";
  }
  renderCalendarRow(setting: Setting, feed: CalendarFeed, index: number) {
    let name = feed.name;
    let url = feed.url;
    setting.addText((text) => {
      text.setPlaceholder("Name").setValue(feed.name).onChange((value) => {
        name = value;
      });
    });
    setting.addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("https://calendar.google.com/…/basic.ics").setValue(feed.url).onChange((value) => {
        url = value;
      });
    });
    setting.addColorPicker((picker) => {
      picker.setValue(feed.color).onChange(async (value) => {
        feed.color = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    setting.addToggle((toggle) => {
      toggle.setTooltip("Show this calendar").setValue(feed.enabled).onChange(async (value) => {
        feed.enabled = value;
        await this.plugin.saveSettings();
        void this.plugin.calendar.refresh();
        this.plugin.refreshBelkiViews();
      });
    });
    setting.addToggle((toggle) => {
      toggle.setTooltip("Also show in the year plan").setValue(feed.inYearPlan).onChange(async (value) => {
        feed.inYearPlan = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Save").setTooltip("Save name and address, then load the calendar").onClick(async () => {
        const current = this.plugin.settings.calendars[index];
        if (!current) return;
        current.name = name.trim() || "Calendar";
        current.url = url.trim();
        await this.plugin.saveSettings();
        await this.plugin.calendar.refresh();
        this.plugin.refreshBelkiViews();
        const state = this.plugin.calendar.feeds.get(current.id);
        new Notice(state?.error ? `Couldn't load ${current.name}: ${state.error}` : `${current.name}: ${state?.events.length ?? 0} events loaded.`);
        this.rerender();
      });
    });
  }
  /** Calendars on Obsidian before 1.13: a collapsible group like Appearance. */
  renderLegacyCalendars(containerEl: HTMLElement) {
    const settings = this.plugin.settings;
    const section = containerEl.createEl("details", { cls: "belki-settings-appearance" });
    if (this.calendarsOpen === true) section.setAttr("open", "");
    section.addEventListener("toggle", () => {
      this.calendarsOpen = section.open;
    });
    section.createEl("summary", { cls: "belki-settings-appearance-summary", text: "Calendars" });
    new Setting(section).setName("Show calendars").setDesc("Events from your online calendars, read-only, next to your tasks.").addToggle((toggle) => {
      toggle.setValue(settings.calendarsEnabled === true).onChange(async (value) => {
        settings.calendarsEnabled = value;
        await this.plugin.saveSettings();
        if (value) void this.plugin.calendar.refresh();
        this.plugin.refreshBelkiViews();
        this.renderLegacyTab();
      });
    });
    if (!settings.calendarsEnabled) return;
    section.createDiv({
      cls: "setting-item-description",
      text: "Use the calendar's secret address in iCal format (Google Calendar: settings of the calendar → integrate calendar). Anyone with this address can read the calendar; it is stored in the plugin's data and synced with it."
    });
    settings.calendars.forEach((feed, index) => {
      const row = new Setting(section).setName(feed.name).setDesc(this.calendarStatus(feed));
      this.renderCalendarRow(row, feed, index);
      row.addExtraButton((button) => {
        button.setIcon("trash").setTooltip("Remove calendar").onClick(() => {
          void this.removeCalendar(index);
        });
      });
    });
    new Setting(section).addButton((button) => {
      button.setButtonText("Add calendar").onClick(() => {
        void this.addCalendar();
      });
    });
  }
  async addCalendar() {
    const colors = ["#3d6a8c", "#4f7a4a", "#8e5a2c", "#6b4c8e", "#2a8a87"];
    const settings = this.plugin.settings;
    settings.calendars = [...settings.calendars, {
      id: `cal-${Date.now().toString(36)}`,
      name: settings.calendars.length ? `Calendar ${settings.calendars.length + 1}` : "Work",
      url: "",
      color: colors[settings.calendars.length % colors.length],
      enabled: true,
      inYearPlan: false
    }];
    await this.plugin.saveSettings();
    this.rerender();
  }
  async removeCalendar(index: number) {
    const settings = this.plugin.settings;
    const feed = settings.calendars[index];
    if (!feed) return;
    settings.calendars = settings.calendars.filter((_, i) => i !== index);
    await this.plugin.saveSettings();
    void this.plugin.calendar.refresh();
    this.plugin.refreshBelkiViews();
    new Notice(`Calendar "${feed.name}" removed.`);
    this.rerender();
  }
  buildSectorsPage(): SettingDefinitionItem {
    const count = () => {
      const n = this.plugin.settings.sectors.length;
      return n === 1 ? "1 sector" : `${n} sectors`;
    };
    return {
      type: "page",
      name: "Sectors",
      desc: "The columns of the board: their tags, names, order, and review steps. Set up once; changing a tag rewrites your tasks file.",
      displayValue: count,
      items: [
        {
          name: "",
          desc: "The tag is written 1:1 as #tag in the tasks file; changing a tag automatically renames already-tagged tasks. Drag rows to change the column order on the board.",
          searchable: false
        },
        this.buildSectorList(),
        {
          name: "Mark long waits",
          desc: "Waiting tasks show how long they've been waiting. After this many days the count turns red as a nudge to follow up. Set it to 0 to turn this off.",
          control: { type: "number", key: "waitingHighlightDays", min: 0, step: 1, placeholder: "7" }
        },
        {
          name: "Mark stuck tasks",
          desc: "Tasks that sit this many weeks in the same sector get a note, in the weekly review and on the board. Only sectors in the weekly review count; recurring tasks never do. Set it to 0 to turn this off.",
          control: { type: "number", key: "stuckWeeks", min: 0, step: 1, placeholder: "3" }
        }
      ]
    };
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
        this.rerender();
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
    this.rerender();
  }
  async commitSectorEdit(index: number, rawTag: string, rawLabel: string) {
    const sectors = this.plugin.settings.sectors;
    const current = sectors[index];
    if (!current) return;
    const newTag = normalizeSectorTag(rawTag);
    if (!newTag || !SECTOR_TAG_PATTERN.test(newTag)) {
      new Notice("Invalid tag: only letters, numbers, - _ / allowed.");
      this.rerender();
      return;
    }
    const lower = newTag.toLowerCase();
    if (isReservedSectorTag(lower)) {
      new Notice(`"${newTag}" is reserved and can't be used as a sector tag.`);
      this.rerender();
      return;
    }
    if (sectors.some((s, i) => i !== index && s.tag.toLowerCase() === lower)) {
      new Notice(`The tag "${newTag}" is already used by another sector.`);
      this.rerender();
      return;
    }
    const newLabel = (rawLabel || "").trim() || newTag;
    const oldTag = current.tag;
    const tagChanged = oldTag.toLowerCase() !== lower;
    if (tagChanged) {
      const affected = this.plugin.store.countTasksInSector(oldTag);
      if (affected > 0) {
        const confirmed = await confirmAction(this.app, {
          title: "Rename sector tag?",
          subject: `#${oldTag} \u2192 #${newTag}`,
          body: `This changes ${taskCount(affected)} in your tasks file.`,
          confirmText: "Rename",
          destructive: true
        });
        if (!confirmed) {
          this.rerender();
          return;
        }
      }
    }
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
    this.rerender();
  }
  async removeSector(index: number) {
    const sectors = this.plugin.settings.sectors;
    if (sectors.length <= 1) {
      new Notice("At least one sector must remain.");
      this.rerender();
      return;
    }
    const removed = sectors[index];
    if (!removed) return;
    const affected = this.plugin.store.countTasksInSector(removed.tag);
    const confirmed = await confirmAction(this.app, {
      title: "Remove sector?",
      subject: `${removed.label} (#${removed.tag})`,
      body: affected > 0
        ? `Its ${taskCount(affected)} keep #${removed.tag} as a label but won't appear in any sector. Nothing is deleted from your tasks file.`
        : "No tasks use this sector yet. Nothing changes in your tasks file.",
      confirmText: "Remove",
      destructive: true
    });
    if (!confirmed) {
      this.rerender();
      return;
    }
    this.plugin.settings.sectors = sectors.filter((_, i) => i !== index);
    applySectorSettings(this.plugin.settings.sectors);
    await this.plugin.saveSettings();
    await this.plugin.reloadTasks();
    this.plugin.refreshBelkiViews();
    new Notice(`Sector "${removed.label}" removed. Existing tasks with #${removed.tag} are kept but no longer shown as their own column (the tag becomes a plain label).`);
    this.rerender();
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
    this.rerender();
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
      ["Overview icon", "overview"],
      ["Inbox icon", "inbox"],
      ["Today icon", "today"],
      ["Upcoming icon", "upcoming"],
      ["Filters icon", "filters"],
      ["Projects icon", "projects"],
      ["Completed icon", "completed"],
      ["Year plan icon", "year"]
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
          heading: "Layout",
          items: [
            {
              name: "Task rows",
              desc: 'Stacked shows title, description, and due date/labels/project on their own lines below the title. Single line keeps everything on one row (title truncates, description is hidden) for a much shorter list.',
              control: { type: "dropdown", key: "rowLayout", options: { stacked: "Stacked", singleLine: "Single line" } }
            }
          ]
        },
        {
          type: "group",
          heading: "Theme",
          items: [
            {
              name: "Style",
              desc: "Editorial uses serif headings, cards with tinted section headers, and pill-shaped dates. Its warm palette applies when the color scheme follows Obsidian; a fixed or custom scheme keeps its own colors.",
              control: { type: "dropdown", key: "visualStyle", options: VISUAL_STYLE_LABELS }
            },
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
    this.rerender();
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
          this.rerender();
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
          this.rerender();
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
          this.rerender();
        })();
      });
    });
  }
  // Imperative fallback for Obsidian < 1.13. On 1.13+ the tab renders
  // declaratively from getSettingDefinitions() and display() is never called.
  // Obsidian calls display() itself on older versions; our own code calls
  // renderLegacyTab() instead, so nothing here references the deprecated API.
  display() {
    this.renderLegacyTab();
  }
  renderLegacyTab() {
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
    new Setting(containerEl).setName("Start view").setDesc("Which view the board opens on when you open it from the ribbon, the command palette, or the sidebar.").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(START_VIEW_LABELS)) {
        dropdown.addOption(value, label);
      }
      dropdown.setValue(normalizeStartView(this.plugin.settings.startView)).onChange(async (value) => {
        this.plugin.settings.startView = normalizeStartView(value);
        await this.plugin.saveSettings();
      });
    });
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
    new Setting(containerEl).setName("Show release notes after updates").setDesc("After the plugin updates, show what changed. The command palette can open them again any time.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.showReleaseNotes !== false).onChange(async (value) => {
        this.plugin.settings.showReleaseNotes = value;
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
    new Setting(containerEl).setName("Time blocking in today").setDesc("A timeline next to the today view. Drag a task onto a time, or right-click it and choose a time. Blocks are kept for that day only and never written to your tasks file.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.timeBlocking === true).onChange(async (value) => {
        this.plugin.settings.timeBlocking = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.renderLegacyTab();
      });
    });
    if (this.plugin.settings.timeBlocking) {
      for (const [key, label, fallback] of [["dayStartHour", "Day starts at", 8], ["dayEndHour", "Day ends at", 18]] as const) {
        new Setting(containerEl).setName(label).setDesc(key === "dayStartHour" ? "First hour on the timeline (0–23)." : "Last hour on the timeline (1–24).").addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.plugin.settings[key])).onChange(async (value) => {
            const hour = normalizeHour(value, fallback);
            this.plugin.settings[key] = key === "dayStartHour" ? Math.min(hour, 23) : Math.max(hour, 1);
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
          });
        });
      }
    }
    this.renderLegacyCalendars(containerEl);
    new Setting(containerEl).setName("Focus in today (2+8)").setDesc("Lists priority 1 tasks (the must-dos, up to 2) and priority 2 tasks (up to 8 more) at the top of the today view, from any sector and whatever their date. The count turns red when there are more.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.focusSection === true).onChange(async (value) => {
        this.plugin.settings.focusSection = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    new Setting(containerEl).setName("Year plan").setDesc("Appointments and milestones tagged #planning, shown by quarter and next to your tasks. Turning it off hides them everywhere; #planning lines stay in your file untouched and never show up as tasks.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.planningEnabled !== false).onChange(async (value) => {
        this.plugin.settings.planningEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.renderLegacyTab();
      });
    });
    if (this.plugin.settings.planningEnabled !== false) {
      new Setting(containerEl).setName("Archive past years' planning").setDesc("Once a year is over, move its year-plan entries from the tasks file to the archive note. The year plan still shows them, read-only.").addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.archivePastPlanning !== false).onChange(async (value) => {
          this.plugin.settings.archivePastPlanning = value;
          await this.plugin.saveSettings();
        });
      });
    }
    new Setting(containerEl).setName("Write a review summary note").setDesc("After a weekly or monthly review, write a note with what you finished, what moved, what's new, and what you're waiting for.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.reviewNotes === true).onChange(async (value) => {
        this.plugin.settings.reviewNotes = value;
        await this.plugin.saveSettings();
        this.renderLegacyTab();
      });
    });
    if (this.plugin.settings.reviewNotes === true) {
      new Setting(containerEl).setName("Review notes folder").setDesc("Where review summary notes are saved. The folder is created when needed.").addText((text) => {
        text.setPlaceholder("Reviews").setValue(this.plugin.settings.reviewNotesFolder).onChange(async (value) => {
          this.plugin.settings.reviewNotesFolder = normalizeReviewNotesFolder(value);
          await this.plugin.saveSettings();
        });
      });
    }
    new Setting(containerEl).setName("Task rows").setDesc('Stacked shows title, description, and due date/labels/project on their own lines below the title. Single line keeps everything on one row (title truncates, description is hidden) for a much shorter list.').addDropdown((dropdown) => {
      dropdown.addOption("stacked", "Stacked");
      dropdown.addOption("singleLine", "Single line");
      dropdown.setValue(normalizeRowLayout(this.plugin.settings.rowLayout)).onChange(async (value) => {
        this.plugin.settings.rowLayout = normalizeRowLayout(value);
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
    const sectorsSection = containerEl.createEl("details", { cls: "belki-settings-appearance" });
    if (this.sectorsOpen === true) {
      sectorsSection.setAttr("open", "");
    }
    sectorsSection.addEventListener("toggle", () => {
      this.sectorsOpen = sectorsSection.open;
    });
    sectorsSection.createEl("summary", { cls: "belki-settings-appearance-summary", text: "Sectors" });
    sectorsSection.createDiv({
      cls: "setting-item-description",
      text: "Tag (written 1:1 as #tag in the file) and display name per sector column. Changing the tag automatically renames already-tagged tasks in the file. Order here determines column order."
    });
    const sectorsRoot = this.containerEl;
    this.containerEl = sectorsSection;
    try {
      this.plugin.settings.sectors.forEach((sector, index) => {
        this.addSectorSetting(sector, index, this.plugin.settings.sectors.length);
      });
      this.addNewSectorSetting();
      new Setting(sectorsSection).setName("Mark long waits").setDesc("Waiting tasks show how long they've been waiting. After this many days the count turns red as a nudge to follow up. Set it to 0 to turn this off.").addText((text) => {
        text.inputEl.type = "number";
        text.setPlaceholder("7").setValue(String(this.plugin.settings.waitingHighlightDays)).onChange(async (value) => {
          this.plugin.settings.waitingHighlightDays = normalizeAutoDeleteDays(value);
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
      new Setting(sectorsSection).setName("Mark stuck tasks").setDesc("Tasks that sit this many weeks in the same sector get a note, in the weekly review and on the board. Only sectors in the weekly review count; recurring tasks never do. Set it to 0 to turn this off.").addText((text) => {
        text.inputEl.type = "number";
        text.setPlaceholder("3").setValue(String(this.plugin.settings.stuckWeeks)).onChange(async (value) => {
          this.plugin.settings.stuckWeeks = normalizeAutoDeleteDays(value);
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
    } finally {
      this.containerEl = sectorsRoot;
    }
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
      new Setting(appearance).setName("Style").setDesc("Editorial uses serif headings, cards with tinted section headers, and pill-shaped dates. Its warm palette applies when the color scheme follows Obsidian; a fixed or custom scheme keeps its own colors.").addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(VISUAL_STYLE_LABELS)) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(normalizeVisualStyle(this.plugin.settings.visualStyle)).onChange(async (value) => {
          this.plugin.settings.visualStyle = normalizeVisualStyle(value);
          await this.plugin.saveSettings();
          this.plugin.refreshBelkiViews();
        });
      });
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
          this.rerender();
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
            this.rerender();
          });
        }).addButton((button) => {
          button.setButtonText("Load dark").onClick(async () => {
            this.plugin.settings.themeColors = { ...THEME_PRESETS.dark };
            await this.plugin.saveSettings();
            this.plugin.refreshBelkiViews();
            this.rerender();
          });
        });
      }
      new Setting(appearance).setName("Sidebar icons").setDesc("Lucide-Icon-Namen (siehe lucide.dev/icons), z. B. \u201Esearch\u201C, \u201Ecalendar-check\u201C.").setHeading();
      this.addIconSetting("Search icon", "search");
      this.addIconSetting("Overview icon", "overview");
      this.addIconSetting("Inbox icon", "inbox");
      this.addIconSetting("Today icon", "today");
      this.addIconSetting("Upcoming icon", "upcoming");
      this.addIconSetting("Filters icon", "filters");
      this.addIconSetting("Projects icon", "projects");
      this.addIconSetting("Completed icon", "completed");
      this.addIconSetting("Year plan icon", "year");
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
  addIconSetting(name: string, key: string) {
    new Setting(this.containerEl).setName(name).addText((text) => {
      text.setValue(this.plugin.settings.icons[key]).onChange(async (value) => {
        const trimmed = value.trim();
        this.plugin.settings.icons[key] = LUCIDE_ICON_NAME_PATTERN.test(trimmed) ? trimmed : DEFAULT_SETTINGS.icons[key];
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
      });
    });
  }
  addThemeColorSetting(entry: { key: string; cssVar: string; label: string }) {
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
  addSectorSetting(sector: SectorConfig, index: number, total: number) {
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
        this.rerender();
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
  async addSector(rawTag: string, rawLabel: string) {
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
    this.rerender();
  }
  addFontSetting(name: string, description: string, key: "uiFont" | "taskTitleFont" | "taskDescriptionFont" | "labelFont") {
    new Setting(this.containerEl).setName(name).setDesc(description).addDropdown((dropdown) => {
      for (const option of FONT_OPTIONS) {
        dropdown.addOption(option, fontOptionLabel(option));
      }
      dropdown.setValue(this.plugin.settings[key]).onChange(async (value) => {
        this.plugin.settings[key] = normalizeFontOption(value);
        await this.plugin.saveSettings();
        this.plugin.refreshBelkiViews();
        this.rerender();
      });
    });
  }
  addProjectColorSetting(project: string) {
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
          this.rerender();
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
          this.rerender();
        })();
      });
    });
  }
  addLabelColorSetting(label: string) {
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
          this.rerender();
        })();
      });
    });
  }
}
