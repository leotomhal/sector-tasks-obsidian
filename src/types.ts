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
  completedDate?: string;
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
  lastWeeklyReviewKey: string;
  lastMonthlyReviewKey: string;
}

// Minimal surface of the Tasks plugin's public API (apiV1) that Sector Tasks uses.
export interface TasksApiV1 {
  createTaskLineModal(): Promise<string>;
  editTaskLineModal(taskLine: string): Promise<string>;
}
