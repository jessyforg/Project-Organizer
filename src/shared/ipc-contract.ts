import { z } from 'zod';
import type {
  Dashboard,
  Folder,
  ProfileSettings,
  Project,
  ProjectDetails,
  ProjectListItem,
  RestoreResult,
  SearchResults,
  Tag,
  Task,
  TaskRelations,
  TaskTrashPreview,
  TaskUpdateResult,
  TrashEntry,
  WorkflowStatus,
} from './domain';
import type { IpcChannel } from './ipc-channels';
import * as s from './schemas';
import type { AppInfo, ProfileSummary } from './types';

export type { IpcChannel } from './ipc-channels';

export const PROFILE_NAME_MAX_LENGTH = 100;

export const profileNameSchema = z
  .string()
  .trim()
  .min(1, 'Profile name is required.')
  .max(
    PROFILE_NAME_MAX_LENGTH,
    `Profile name must be at most ${PROFILE_NAME_MAX_LENGTH} characters.`,
  );

const profileIdSchema = z.uuid();

/**
 * Request schemas for every IPC channel. Payloads are validated in the main process;
 * unknown fields are rejected. The preload bridge never imports this file at runtime.
 */
export const ipcContract = {
  'app:getInfo': s.emptySchema,
  'profiles:list': s.emptySchema,
  'profiles:getActive': s.emptySchema,
  'profiles:create': z.strictObject({ displayName: profileNameSchema }),
  'profiles:rename': z.strictObject({ id: profileIdSchema, displayName: profileNameSchema }),
  'profiles:switch': z.strictObject({ id: profileIdSchema }),
  'settings:get': s.emptySchema,
  'settings:update': s.updateSettingsSchema,
  'dashboard:get': s.emptySchema,
  'folders:list': s.emptySchema,
  'folders:create': s.createFolderSchema,
  'folders:rename': s.renameFolderSchema,
  'folders:reorder': s.reorderSchema,
  'folders:delete': s.idSchema,
  'tags:list': s.emptySchema,
  'tags:create': s.createTagSchema,
  'tags:update': s.updateTagSchema,
  'tags:delete': s.idSchema,
  'tags:setTaskTags': s.setTaskTagsSchema,
  'tags:setProjectTags': s.setProjectTagsSchema,
  'projects:list': s.listProjectsSchema,
  'projects:get': s.idSchema,
  'projects:create': s.createProjectSchema,
  'projects:update': s.updateProjectSchema,
  'projects:setStatus': s.setProjectStateSchema,
  'projects:archive': s.idSchema,
  'projects:unarchive': s.idSchema,
  'statuses:list': s.projectIdSchema,
  'statuses:add': s.addStatusSchema,
  'statuses:rename': s.renameStatusSchema,
  'statuses:reorder': s.reorderStatusesSchema,
  'statuses:setDefault': s.idSchema,
  'statuses:remove': s.removeStatusSchema,
  'tasks:list': s.taskListQuerySchema,
  'tasks:get': s.idSchema,
  'tasks:create': s.createTaskSchema,
  'tasks:update': s.updateTaskSchema,
  'tasks:setCompleted': s.setCompletedSchema,
  'tasks:move': s.moveTaskSchema,
  'tasks:reorder': s.reorderTaskSchema,
  'dependencies:list': s.taskIdSchema,
  'dependencies:add': s.dependencySchema,
  'dependencies:remove': s.dependencySchema,
  'trash:list': s.emptySchema,
  'trash:previewTask': s.idSchema,
  'trash:trashTask': s.idSchema,
  'trash:trashProject': s.idSchema,
  'trash:restore': s.batchSchema,
  'trash:deletePermanently': s.batchSchema,
  'trash:empty': s.emptySchema,
  'search:query': s.searchSchema,
} as const satisfies Record<IpcChannel, z.ZodType>;

/** Shape the renderer sends. */
export type IpcRequest<C extends IpcChannel> = z.input<(typeof ipcContract)[C]>;

/** Shape a handler receives after validation. */
export type IpcParsedRequest<C extends IpcChannel> = z.output<(typeof ipcContract)[C]>;

export interface IpcResponses {
  'app:getInfo': AppInfo;
  'profiles:list': ProfileSummary[];
  'profiles:getActive': ProfileSummary | null;
  'profiles:create': ProfileSummary;
  'profiles:rename': ProfileSummary;
  'profiles:switch': ProfileSummary;
  'settings:get': ProfileSettings;
  'settings:update': ProfileSettings;
  'dashboard:get': Dashboard;
  'folders:list': Folder[];
  'folders:create': Folder;
  'folders:rename': Folder;
  'folders:reorder': Folder[];
  'folders:delete': null;
  'tags:list': Tag[];
  'tags:create': Tag;
  'tags:update': Tag;
  'tags:delete': null;
  'tags:setTaskTags': null;
  'tags:setProjectTags': null;
  'projects:list': ProjectListItem[];
  'projects:get': ProjectDetails;
  'projects:create': Project;
  'projects:update': Project;
  'projects:setStatus': Project;
  'projects:archive': Project;
  'projects:unarchive': Project;
  'statuses:list': WorkflowStatus[];
  'statuses:add': WorkflowStatus;
  'statuses:rename': WorkflowStatus;
  'statuses:reorder': WorkflowStatus[];
  'statuses:setDefault': WorkflowStatus;
  'statuses:remove': { reassignedTasks: number };
  'tasks:list': Task[];
  'tasks:get': Task;
  'tasks:create': Task;
  'tasks:update': TaskUpdateResult;
  'tasks:setCompleted': TaskUpdateResult;
  'tasks:move': { task: Task; removedDependencies: number };
  'tasks:reorder': Task;
  'dependencies:list': TaskRelations;
  'dependencies:add': null;
  'dependencies:remove': null;
  'trash:list': TrashEntry[];
  'trash:previewTask': TaskTrashPreview;
  'trash:trashTask': { batchId: string };
  'trash:trashProject': { batchId: string };
  'trash:restore': RestoreResult;
  'trash:deletePermanently': null;
  'trash:empty': { removed: number };
  'search:query': SearchResults;
}
