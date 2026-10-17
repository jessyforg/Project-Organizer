import { z } from 'zod';
import {
  COLOR_TOKENS,
  PRIORITIES,
  PROJECT_KINDS,
  PROJECT_STATES,
  STATUS_CATEGORIES,
  THEMES,
} from './domain';

/** Input validation for domain operations. Used at the IPC boundary and by forms. */

export const LIMITS = {
  name: 200,
  title: 500,
  description: 1_000_000,
  searchText: 200,
  listPageSize: 1000,
} as const;

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A calendar date (YYYY-MM-DD) in the user's local calendar; never converted through UTC. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine(isRealDate, 'This date does not exist.');

const id = z.uuid();
const name = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(LIMITS.name, `Name must be at most ${LIMITS.name} characters.`);
const title = z
  .string()
  .trim()
  .min(1, 'Title is required.')
  .max(LIMITS.title, `Title must be at most ${LIMITS.title} characters.`);
const description = z.string().max(LIMITS.description, 'Description is too long.');
const color = z.enum(COLOR_TOKENS);
const priority = z.enum(PRIORITIES);
const idList = z.array(id).max(1000);

// Folders
export const createFolderSchema = z.strictObject({ name });
export const renameFolderSchema = z.strictObject({ id, name });
export const reorderSchema = z.strictObject({ ids: idList });

// Tags
export const createTagSchema = z.strictObject({ name, color: color.nullable().optional() });
export const updateTagSchema = z.strictObject({
  id,
  name: name.optional(),
  color: color.nullable().optional(),
});
export const setTaskTagsSchema = z.strictObject({ taskId: id, tagIds: idList });
export const setProjectTagsSchema = z.strictObject({ projectId: id, tagIds: idList });

// Projects
export const createProjectSchema = z.strictObject({
  name,
  description: description.nullable().optional(),
  kind: z.enum(PROJECT_KINDS).optional(),
  color: color.nullable().optional(),
  folderId: id.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
  tagIds: idList.optional(),
});
export const updateProjectSchema = z.strictObject({
  id,
  name: name.optional(),
  description: description.nullable().optional(),
  kind: z.enum(PROJECT_KINDS).optional(),
  color: color.nullable().optional(),
  folderId: id.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});
export const setProjectStateSchema = z.strictObject({ id, status: z.enum(PROJECT_STATES) });

// Workflow statuses
export const addStatusSchema = z.strictObject({
  projectId: id,
  name,
  category: z.enum(STATUS_CATEGORIES),
});
export const renameStatusSchema = z.strictObject({ id, name });
export const reorderStatusesSchema = z.strictObject({ projectId: id, ids: idList });
export const removeStatusSchema = z.strictObject({ id, replacementStatusId: id });

// Tasks
export const createTaskSchema = z.strictObject({
  title,
  projectId: id.optional(),
  parentTaskId: id.optional(),
  statusId: id.optional(),
  description: description.nullable().optional(),
  priority: priority.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  tagIds: idList.optional(),
});
export const updateTaskSchema = z.strictObject({
  id,
  title: title.optional(),
  statusId: id.optional(),
  description: description.nullable().optional(),
  priority: priority.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
});
export const moveTaskSchema = z.strictObject({ id, projectId: id });
/** Places the task before `beforeTaskId` among its siblings, or last when null. */
export const reorderTaskSchema = z.strictObject({ id, beforeTaskId: id.nullable() });

export const TASK_SORTS = ['priority', 'due', 'created', 'manual', 'updated', 'completed'] as const;
export const DUE_FILTERS = ['overdue', 'today', 'upcoming', 'none'] as const;

export const taskListQuerySchema = z.strictObject({
  projectId: id.optional(),
  /** null = top-level tasks only; an ID = that task's subtasks; omitted = all. */
  parentTaskId: id.nullable().optional(),
  statusIds: idList.optional(),
  statusCategories: z.array(z.enum(STATUS_CATEGORIES)).optional(),
  priorities: z.array(z.union([priority, z.literal('none')])).optional(),
  tagIds: idList.optional(),
  due: z.enum(DUE_FILTERS).optional(),
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
  text: z.string().max(LIMITS.searchText).optional(),
  includeArchived: z.boolean().optional(),
  sort: z.enum(TASK_SORTS).optional(),
  limit: z.number().int().min(1).max(LIMITS.listPageSize).optional(),
  offset: z.number().int().min(0).optional(),
});

// Dependencies
export const dependencySchema = z.strictObject({ taskId: id, dependsOnTaskId: id });

export const idSchema = z.strictObject({ id });
export const batchSchema = z.strictObject({ batchId: id });
export const searchSchema = z.strictObject({ text: z.string().max(LIMITS.searchText) });
export const setCompletedSchema = z.strictObject({ id, completed: z.boolean() });
export const taskIdSchema = z.strictObject({ taskId: id });
export const projectIdSchema = z.strictObject({ projectId: id });
export const listProjectsSchema = z.strictObject({ includeArchived: z.boolean().optional() });
export const updateSettingsSchema = z.strictObject({ theme: z.enum(THEMES).optional() });
export const emptySchema = z.strictObject({});

export type CreateFolderInput = z.output<typeof createFolderSchema>;
export type RenameFolderInput = z.output<typeof renameFolderSchema>;
export type CreateTagInput = z.output<typeof createTagSchema>;
export type UpdateTagInput = z.output<typeof updateTagSchema>;
export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
export type AddStatusInput = z.output<typeof addStatusSchema>;
export type RemoveStatusInput = z.output<typeof removeStatusSchema>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type MoveTaskInput = z.output<typeof moveTaskSchema>;
export type ReorderTaskInput = z.output<typeof reorderTaskSchema>;
export type TaskListQuery = z.output<typeof taskListQuerySchema>;
export type DependencyInput = z.output<typeof dependencySchema>;
