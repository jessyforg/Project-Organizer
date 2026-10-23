import type { AppLinkKind } from './app-links';

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

/** A folder on the Notes screen (ADR-0014), separate from project folders. */
export interface NoteFolder {
  id: string;
  name: string;
  /** Notes in the folder that are not in the trash. */
  noteCount: number;
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
  kind: 'project' | 'task' | 'note';
  title: string;
  /** For task and note entries: the project the item belongs to. */
  projectName: string | null;
  itemCount: number;
  deletedAt: string;
  purgeAfter: string;
}

export interface RestoreResult {
  restoredProjects: number;
  restoredTasks: number;
  restoredNotes: number;
  /** Dependencies of restored tasks whose prerequisite is still in the trash. */
  unresolvedDependencies: { taskId: string; prerequisiteId: string }[];
}

/** A note without its body, for lists. `excerpt` is the start of the body as plain text. */
export interface NoteSummary {
  id: string;
  projectId: string;
  /** The note's folder (ADR-0014); null when it is in no folder. */
  folderId: string | null;
  /** When the note was archived (ADR-0015); null for live notes. */
  archivedAt: string | null;
  title: string;
  excerpt: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** A Markdown note (R26). The body is stored as typed and never rendered as HTML. */
export interface Note {
  id: string;
  projectId: string;
  folderId: string | null;
  archivedAt: string | null;
  title: string;
  body: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchResults {
  projects: Project[];
  tasks: Task[];
  notes: NoteSummary[];
}

/** One result of the quick switcher (ADR-0018). */
export interface SwitcherItem {
  kind: AppLinkKind;
  id: string;
  title: string;
  /** The project a task or note belongs to; null for a project. */
  projectName: string | null;
  /** A note's folder, or a project's folder; null for tasks and items outside folders. */
  folderName: string | null;
  /** The item, or its project, is archived. */
  archived: boolean;
  /** A task that is done. */
  completed: boolean;
}

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Primary colour palettes (ADR-0015); each is checked for contrast in light and dark. */
export const ACCENTS = ['blue', 'teal', 'green', 'violet', 'rose', 'amber'] as const;
export type Accent = (typeof ACCENTS)[number];

/** Secondary colour: the tone of backgrounds and surfaces (ADR-0015). */
export const SURFACES = ['cool', 'neutral', 'warm'] as const;
export type Surface = (typeof SURFACES)[number];

/** How many live items use a tag. */
export interface TagUsage {
  tasks: number;
  projects: number;
  notes: number;
}

export interface ProfileSettings {
  theme: Theme;
  accent: Accent;
  surface: Surface;
  /** Whether notes show their outline panel (ADR-0017). */
  noteOutline: boolean;
}

export type AttachmentKind = 'image' | 'file';

/** An image or other file in a note (ADR-0017 stage 6). */
export interface AttachmentInfo {
  id: string;
  /** The file name, without folders. */
  name: string;
  /** Images are shown; other files are saved or opened. Decided from the file's contents. */
  kind: AttachmentKind;
  mime: string;
  size: number;
  /** Removed (no note referred to it for 30 days) or never existed. */
  missing: boolean;
  /** Runs code when opened (by its extension): it can be saved, but not opened from the app. */
  executable?: boolean;
}

/** The current state of an item a note links to (ADR-0017). */
export interface AppLinkInfo {
  kind: AppLinkKind;
  id: string;
  /** Today's title or name; empty when missing. */
  label: string;
  /** Deleted or in the trash: the link is broken until it is restored. */
  missing: boolean;
  archived: boolean;
  /** The project a note or task belongs to. */
  projectId: string | null;
  /** Tasks only. */
  status?: { name: string; category: StatusCategory };
  dueDate?: string | null;
}

/** A note that links to, or mentions, another note (ADR-0017). */
export interface Backlink {
  noteId: string;
  title: string;
  /** Plain text around the link or mention. */
  snippet: string;
  archived: boolean;
  updatedAt: string;
}

export interface NoteBacklinks {
  /** Notes with a link to this note. */
  linked: Backlink[];
  /** Notes that mention its title in plain text, without a link. */
  unlinked: Backlink[];
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
