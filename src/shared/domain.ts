export const STATUS_CATEGORIES = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Ordered from most to least urgent. Tasks may also have no priority (null). */
export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PROJECT_KINDS = ['general', 'software'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STATES = ['active', 'completed'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

/** Colour token names; the renderer maps them to theme colours. */
export const COLOR_TOKENS = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Days after which trashed items are permanently deleted. */
export const TRASH_RETENTION_DAYS = 30;
/** "Upcoming" means due after today and within this many days. */
export const UPCOMING_DAYS = 7;

export interface Folder {
  id: string;
  name: string;
  sortKey: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: ColorToken | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStatus {
  id: string;
  projectId: string;
  name: string;
  category: StatusCategory;
  sortKey: number;
  isDefault: boolean;
}

export interface Project {
  id: string;
  folderId: string | null;
  name: string;
  description: string | null;
  kind: ProjectKind;
  status: ProjectState;
  isInbox: boolean;
  color: ColorToken | null;
  startDate: string | null;
  targetDate: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
}

export interface Task {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  statusId: string;
  statusCategory: StatusCategory;
  title: string;
  description: string | null;
  priority: Priority | null;
  startDate: string | null;
  dueDate: string | null;
  sortKey: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
  prerequisiteIds: string[];
  subtaskCount: number;
  completedSubtaskCount: number;
}

/** Calculated progress. `ratio` is null when nothing is countable (shown as "—"). */
export interface Progress {
  done: number;
  total: number;
  ratio: number | null;
}

/** Non-blocking warnings and suggestions returned by task updates. */
export type TaskNotice =
  | { type: 'unfinished_prerequisites'; taskIds: string[] }
  | { type: 'parent_may_be_complete'; taskId: string }
  | { type: 'project_may_be_complete'; projectId: string }
  | { type: 'completed_project_has_open_tasks'; projectId: string };

export interface TaskUpdateResult {
  task: Task;
  notices: TaskNotice[];
}

export interface TaskReference {
  id: string;
  title: string;
  statusCategory: StatusCategory;
  trashed: boolean;
}

export interface TaskTrashPreview {
  subtaskCount: number;
  /** Live tasks outside the deletion that depend on the task or its subtasks. */
  dependents: TaskReference[];
}

export interface TrashEntry {
  batchId: string;
  kind: 'project' | 'task';
  title: string;
  /** For task entries: the project the task belongs to. */
  projectName: string | null;
  itemCount: number;
  deletedAt: string;
  purgeAfter: string;
}

export interface RestoreResult {
  restoredProjects: number;
  restoredTasks: number;
  /** Dependencies of restored tasks whose prerequisite is still in the trash. */
  unresolvedDependencies: { taskId: string; prerequisiteId: string }[];
}

export interface SearchResults {
  projects: Project[];
  tasks: Task[];
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface ProfileSettings {
  theme: Theme;
}

export interface ProjectListItem extends Project {
  progress: Progress;
}

export interface ProjectDetails {
  project: Project;
  progress: Progress;
  statuses: WorkflowStatus[];
  suggestCompletion: boolean;
}

export interface TaskRelations {
  prerequisites: TaskReference[];
  dependents: TaskReference[];
}

export interface Dashboard {
  today: string;
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
  recentlyUpdated: Task[];
  recentlyCompleted: Task[];
  activeProjects: ProjectListItem[];
  openTaskCount: number;
  completedThisWeek: number;
}
