export const SORT_MODES = [
  "smart",
  "due",
  "priority",
  "deadline",
  "created",
  "project",
  "alphabetical"
];
export const OVERDUE_RANGES = [
  "yesterday",
  "last7",
  "last30",
  "older"
];
export const FONT_OPTIONS = [
  "system",
  "ibmPlexSans",
  "ibmPlexMono",
  "spaceGrotesk",
  "spaceMono",
  "manrope",
  "jetBrainsMono",
  "sourceSans3",
  "inter",
  "geistMono",
  "dmSans"
];

export interface RepeatRule {
  frequency: string;
  interval?: number;
  mode: string;
  ends: string;
  endsCount?: number;
  endsDate?: string;
  weekday?: number;
  dayOfMonth?: number;
  month?: number;
  raw?: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  /** "/" (in progress) or "-" (cancelled) for open tasks; kept so a save writes the line back unchanged. */
  status?: string;
  completedDate?: string;
  /** Tasks-plugin dates this plugin doesn't act on but must preserve: ⏳ scheduled, 🛫 start, ❌ cancelled. */
  scheduled?: string;
  start?: string;
  cancelledDate?: string;
  created?: string;
  due?: string;
  deadline?: string;
  project?: string;
  priority: string;
  description?: string;
  labels: string[];
  attachments: unknown[];
  repeat?: RepeatRule;
  completedOccurrences?: string[];
  parentId?: string;
  extraProperties: Record<string, unknown>[];
  order: number;
  sourcePath?: string;
  /** A year-plan entry (#planning), not a task: kept out of every task list, review and count. */
  planning?: boolean;
  /** A #planning entry that is also tagged #milestone; only these can be checked off. */
  milestone?: boolean;
  /**
   * A planning entry without an exact day: "month" or "quarter". Written as
   * #planning/month or #planning/quarter; 📅 holds the period's first day.
   */
  precision?: string;
}

export interface SectorConfig {
  tag: string;
  label: string;
  isWaiting?: boolean;
  inWeekly?: boolean;
  inMonthly?: boolean;
}

export interface FileBlock {
  type: string;
  taskId?: string;
  line?: string;
}

export interface ReviewStep {
  kind: string;
  tag?: string;
  label: string;
  taskIds: string[];
  totalTasks: number;
  doneTasks: number;
}

export interface ReviewSession {
  type: string;
  totalSteps: number;
  completedSteps: number;
  steps: ReviewStep[];
  stepIndex: number;
  taskIndex: number;
  /** Weekly/monthly only: where each open task stood when the review began, for the summary note. */
  startedAt?: string;
  startSnapshot?: Record<string, ReviewSnapshotEntry>;
}

export interface ReviewSnapshotEntry {
  /** Sector tag, or "" for the Inbox. */
  sector: string;
  title: string;
}

export interface BelkiSettings {
  tasksFilePath: string;
  dataFolderPath: string;
  sectors: SectorConfig[];
  icons: Record<string, string>;
  projectColors: Record<string, string>;
  labelColors: Record<string, string>;
  labelRegistry: string[];
  archivedProjects: string[];
  sortMode: string;
  groupBy: string;
  defaultOverdueRange: string;
  uiFont: string;
  taskTitleFont: string;
  taskDescriptionFont: string;
  labelFont: string;
  themePreset: string;
  themeColors: Record<string, string>;
  reviewSession: ReviewSession | null;
  autoDeleteCompletedAfterDays: number;
  searchExcludeCompleted: boolean;
  rowLayout: string;
  startView: string;
  visualStyle: string;
  showReleaseNotes: boolean;
  lastSeenVersion: string;
  /** Task id → ISO date the task entered the waiting sector. */
  waitingSince: Record<string, string>;
  /** Mark waiting tasks once they have waited this many days; 0 never marks them. */
  waitingHighlightDays: number;
  reviewNotes: boolean;
  /** Move year-plan entries of past years to the archive note on startup. */
  archivePastPlanning: boolean;
  reviewNotesFolder: string;
  lastWeeklyReviewKey: string;
  lastMonthlyReviewKey: string;
}

