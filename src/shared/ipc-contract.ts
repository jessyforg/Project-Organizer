import { z } from 'zod';
import type {
  AppLinkInfo,
  AttachmentInfo,
  Backlink,
  Dashboard,
  Folder,
  Note,
  NoteBacklinks,
  NoteFolder,
  NoteSummary,
  ProfileSettings,
  Project,
  ProjectDetails,
  ProjectListItem,
  RestoreResult,
  SearchResults,
  Tag,
  TagUsage,
  Task,
  TaskRelations,
  TaskTrashPreview,
  TaskUpdateResult,
  TrashEntry,
  WorkflowStatus,
} from './domain';
import type { IpcChannel } from './ipc-channels';
import * as s from './schemas';
import type {
  AppInfo,
  BackupInfo,
  ChosenFile,
  ProfileSummary,
  RestoreTestReport,
  SaveResult,
  SnapshotInfo,
  TrashedProfile,
} from './types';

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

export const BACKUP_PASSWORD_MIN = 10;
const passwordSchema = z
  .string()
  .min(BACKUP_PASSWORD_MIN, `Use at least ${BACKUP_PASSWORD_MIN} characters.`)
  .max(1024, 'The password is too long.');
const tokenSchema = z.uuid();
const snapshotNameSchema = z.string().regex(/^[0-9A-Za-z.-]{1,120}$/, 'Unknown snapshot.');

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
  'profiles:listTrashed': s.emptySchema,
  'profiles:trash': z.strictObject({ id: profileIdSchema }),
  'profiles:restoreTrashed': z.strictObject({ id: profileIdSchema }),
  'profiles:deletePermanently': z.strictObject({ id: profileIdSchema }),
  'profiles:snapshots': z.strictObject({ id: profileIdSchema }),
  'profiles:restoreSnapshot': z.strictObject({ id: profileIdSchema, name: snapshotNameSchema }),
  'backup:export': z.strictObject({ password: passwordSchema }),
  'backup:chooseFile': s.emptySchema,
  'backup:inspect': z.strictObject({ token: tokenSchema, password: z.string().min(1).max(1024) }),
  'backup:testRestore': z.strictObject({
    token: tokenSchema,
    password: z.string().min(1).max(1024),
  }),
  'backup:restoreAsNew': z.strictObject({
    token: tokenSchema,
    password: z.string().min(1).max(1024),
    displayName: profileNameSchema,
  }),
  'backup:replaceActive': z.strictObject({
    token: tokenSchema,
    password: z.string().min(1).max(1024),
  }),
  'export:json': s.emptySchema,
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
  'tags:usage': s.emptySchema,
  'tags:setTaskTags': s.setTaskTagsSchema,
  'tags:setProjectTags': s.setProjectTagsSchema,
  'tags:setNoteTags': s.setNoteTagsSchema,
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
  'tasks:moveOnBoard': s.moveOnBoardSchema,
  'notes:list': s.noteListQuerySchema,
  'notes:get': s.idSchema,
  'notes:create': s.createNoteSchema,
  'notes:update': s.updateNoteSchema,
  'notes:move': s.moveNoteSchema,
  'notes:setFolder': s.setNoteFolderSchema,
  'notes:duplicate': s.idSchema,
  'notes:archive': s.idSchema,
  'notes:unarchive': s.idSchema,
  'notes:import': s.importNotesSchema,
  'notes:copyMarkdown': s.idSchema,
  'notes:exportMarkdown': s.idSchema,
  'notes:backlinks': s.idSchema,
  'notes:linkMention': s.linkMentionSchema,
  'links:resolve': s.resolveLinksSchema,
  'links:mentionedIn': s.linkTargetSchema,
  'attachments:add': s.addAttachmentSchema,
  'attachments:info': s.attachmentIdsSchema,
  'attachments:readImage': s.idSchema,
  'attachments:save': s.idSchema,
  'attachments:open': s.idSchema,
  'noteFolders:list': s.emptySchema,
  'noteFolders:create': s.createFolderSchema,
  'noteFolders:rename': s.renameFolderSchema,
  'noteFolders:delete': s.idSchema,
  'dependencies:list': s.taskIdSchema,
  'dependencies:add': s.dependencySchema,
  'dependencies:remove': s.dependencySchema,
  'trash:list': s.emptySchema,
  'trash:previewTask': s.idSchema,
  'trash:trashTask': s.idSchema,
  'trash:trashProject': s.idSchema,
  'trash:trashNote': s.idSchema,
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
  'profiles:listTrashed': TrashedProfile[];
  'profiles:trash': null;
  'profiles:restoreTrashed': ProfileSummary;
  'profiles:deletePermanently': null;
  'profiles:snapshots': SnapshotInfo[];
  'profiles:restoreSnapshot': ProfileSummary;
  'backup:export': SaveResult;
  'backup:chooseFile': ChosenFile | null;
  'backup:inspect': BackupInfo;
  'backup:testRestore': RestoreTestReport;
  'backup:restoreAsNew': ProfileSummary;
  'backup:replaceActive': ProfileSummary;
  'export:json': SaveResult;
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
  'tags:usage': Record<string, TagUsage>;
  'tags:setTaskTags': null;
  'tags:setProjectTags': null;
  'tags:setNoteTags': null;
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
  'tasks:moveOnBoard': TaskUpdateResult;
  'notes:list': NoteSummary[];
  'notes:get': Note;
  'notes:create': Note;
  'notes:update': Note;
  'notes:move': Note;
  'notes:setFolder': Note;
  'notes:duplicate': Note;
  'notes:archive': Note;
  'notes:unarchive': Note;
  'notes:import': Note[];
  'notes:copyMarkdown': null;
  'notes:exportMarkdown': SaveResult;
  'notes:backlinks': NoteBacklinks;
  'notes:linkMention': Note;
  'links:resolve': AppLinkInfo[];
  'links:mentionedIn': Backlink[];
  'attachments:add': AttachmentInfo;
  'attachments:info': AttachmentInfo[];
  'attachments:readImage': { mime: string; data: Uint8Array };
  'attachments:save': SaveResult;
  'attachments:open': null;
  'noteFolders:list': NoteFolder[];
  'noteFolders:create': NoteFolder;
  'noteFolders:rename': NoteFolder;
  'noteFolders:delete': null;
  'dependencies:list': TaskRelations;
  'dependencies:add': null;
  'dependencies:remove': null;
  'trash:list': TrashEntry[];
  'trash:previewTask': TaskTrashPreview;
  'trash:trashTask': { batchId: string };
  'trash:trashProject': { batchId: string };
  'trash:trashNote': { batchId: string };
  'trash:restore': RestoreResult;
  'trash:deletePermanently': null;
  'trash:empty': { removed: number };
  'search:query': SearchResults;
}
