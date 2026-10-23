import fs from 'node:fs';
import path from 'node:path';
import { markdownFileName } from '@shared/markdown-file';
import type { AppInfo } from '@shared/types';
import type { BackupService } from '../backup/backup-service';
import { buildJsonExport, writeJsonExport } from '../backup/json-export';
import { localIsoDate } from '../domain/dates';
import { AppError } from '../errors';
import { writeFileAtomic } from '../notes/attachment-files';
import { writeNoteMarkdown } from '../notes/markdown-files';
import type { FileTokens } from './file-tokens';
import type { ProfileService } from '../profiles/profile-service';
import type { ProfileServices } from '../services';
import type { ChannelImpls } from './handler';

export interface ChannelDeps {
  appInfo: () => AppInfo;
  profiles: ProfileService;
  /** Services bound to the open profile; throws NOT_FOUND when no profile is open. */
  services: () => ProfileServices;
  backups: BackupService;
  fileTokens: FileTokens;
  /** Main-process file dialogs; they return null when the user cancels. */
  dialogs: {
    saveFile(
      defaultName: string,
      filter: { name: string; extension: string },
    ): Promise<string | null>;
    openFile(filter: { name: string; extension: string }): Promise<string | null>;
  };
  /** The system clipboard (Electron's, in the main process; ADR-0014). */
  clipboard: { writeText(text: string): void };
  /** Opening attachments (ADR-0017): a private folder to copy them to, and the system's opener. */
  files: { tempDir: string; openPath(file: string): Promise<string> };
  clock: () => Date;
}

const BACKUP_FILTER = { name: 'ProjectForge backup', extension: 'pfbackup' };
const JSON_FILTER = { name: 'JSON export', extension: 'json' };
const MARKDOWN_FILTER = { name: 'Markdown', extension: 'md' };
const ANY_FILE = { name: 'All files', extension: '*' };

/** A default file name that is safe on Windows. */
function fileNameFor(profileName: string, date: string, extension: string): string {
  const forbidden = '<>:"/\\|?*';
  const safe =
    [...profileName]
      .map((ch) => (ch.charCodeAt(0) < 32 || forbidden.includes(ch) ? '-' : ch))
      .join('')
      .trim() || 'Profile';
  return `ProjectForge ${safe} ${date}.${extension}`;
}

/** One implementation per channel; the mapped type makes a missing channel a compile error. */
export function createChannelImpls(deps: ChannelDeps): ChannelImpls {
  const {
    appInfo,
    profiles,
    services: s,
    backups,
    fileTokens,
    dialogs,
    clipboard,
    clock,
    files,
  } = deps;
  const requireActive = () => {
    const active = profiles.getActive();
    if (!active) throw new AppError('NOT_FOUND', 'No profile is open.');
    return active;
  };
  return {
    'app:getInfo': () => appInfo(),
    'profiles:list': () => profiles.list(),
    'profiles:getActive': () => profiles.getActive(),
    'profiles:create': ({ displayName }) => profiles.create(displayName),
    'profiles:rename': ({ id, displayName }) => profiles.rename(id, displayName),
    'profiles:switch': ({ id }) => profiles.switchTo(id),
    'profiles:listTrashed': () => profiles.listTrashed(),
    'profiles:trash': async ({ id }) => {
      await profiles.trash(id);
      return null;
    },
    'profiles:restoreTrashed': ({ id }) => profiles.restoreTrashed(id),
    'profiles:deletePermanently': async ({ id }) => {
      await profiles.deletePermanently(id);
      return null;
    },
    'profiles:snapshots': ({ id }) => profiles.listSnapshots(id),
    'profiles:restoreSnapshot': ({ id, name }) => profiles.restoreSnapshot(id, name),

    'backup:export': async ({ password }) => {
      const active = requireActive();
      const destination = await dialogs.saveFile(
        fileNameFor(active.displayName, localIsoDate(clock()), BACKUP_FILTER.extension),
        BACKUP_FILTER,
      );
      if (!destination) return { saved: false };
      await backups.exportActive(password, destination);
      return { saved: true, fileName: path.basename(destination) };
    },
    'backup:chooseFile': async () => {
      const file = await dialogs.openFile(BACKUP_FILTER);
      return file ? { token: fileTokens.issue(file), fileName: path.basename(file) } : null;
    },
    'backup:inspect': ({ token, password }) => backups.inspect(fileTokens.resolve(token), password),
    'backup:testRestore': ({ token, password }) =>
      backups.testRestore(fileTokens.resolve(token), password),
    'backup:restoreAsNew': async ({ token, password, displayName }) => {
      const summary = await backups.restoreAsNew(fileTokens.resolve(token), password, displayName);
      fileTokens.revoke(token);
      return summary;
    },
    'backup:replaceActive': async ({ token, password }) => {
      const summary = await backups.replaceActive(fileTokens.resolve(token), password);
      fileTokens.revoke(token);
      return summary;
    },
    'export:json': async () => {
      const active = requireActive();
      const destination = await dialogs.saveFile(
        fileNameFor(active.displayName, localIsoDate(clock()), JSON_FILTER.extension),
        JSON_FILTER,
      );
      if (!destination) return { saved: false };
      const document = buildJsonExport(
        profiles.activeDb(),
        { id: active.id, name: active.displayName },
        appInfo().version,
        clock(),
      );
      writeJsonExport(document, destination);
      return { saved: true, fileName: path.basename(destination) };
    },

    'settings:get': () => s().settings.get(),
    'settings:update': (patch) => s().settings.update(patch),
    'dashboard:get': () => s().dashboard.get(),

    'folders:list': () => s().folders.list(),
    'folders:create': (input) => s().folders.create(input),
    'folders:rename': (input) => s().folders.rename(input),
    'folders:reorder': ({ ids }) => s().folders.reorder(ids),
    'folders:delete': ({ id }) => (s().folders.delete(id), null),

    'tags:list': () => s().tags.list(),
    'tags:create': (input) => s().tags.create(input),
    'tags:update': (input) => s().tags.update(input),
    'tags:delete': ({ id }) => (s().tags.delete(id), null),
    'tags:usage': () => s().tags.usage(),
    'tags:setTaskTags': ({ taskId, tagIds }) => (s().tags.setTaskTags(taskId, tagIds), null),
    'tags:setProjectTags': ({ projectId, tagIds }) => (
      s().tags.setProjectTags(projectId, tagIds),
      null
    ),
    'tags:setNoteTags': ({ noteId, tagIds }) => (s().tags.setNoteTags(noteId, tagIds), null),

    'projects:list': (options) => s().projects.listWithProgress(options),
    'projects:get': ({ id }) => s().projects.details(id),
    'projects:create': (input) => s().projects.create(input),
    'projects:update': (input) => s().projects.update(input),
    'projects:setStatus': ({ id, status }) => s().projects.setStatus(id, status),
    'projects:archive': ({ id }) => s().projects.archive(id),
    'projects:unarchive': ({ id }) => s().projects.unarchive(id),

    'statuses:list': ({ projectId }) => s().statuses.listForProject(projectId),
    'statuses:add': (input) => s().statuses.add(input),
    'statuses:rename': ({ id, name }) => s().statuses.rename(id, name),
    'statuses:reorder': ({ projectId, ids }) => s().statuses.reorder(projectId, ids),
    'statuses:setDefault': ({ id }) => s().statuses.setDefault(id),
    'statuses:remove': (input) => s().statuses.remove(input),

    'tasks:list': (query) => s().tasks.list(query),
    'tasks:get': ({ id }) => s().tasks.get(id),
    'tasks:create': (input) => s().tasks.create(input),
    'tasks:update': (input) => s().tasks.update(input),
    'tasks:setCompleted': ({ id, completed }) => s().tasks.setCompleted(id, completed),
    'tasks:move': (input) => s().tasks.move(input),
    'tasks:reorder': (input) => s().tasks.reorder(input),
    'tasks:moveOnBoard': (input) => s().tasks.moveOnBoard(input),

    'notes:list': (query) => s().notes.list(query),
    'notes:get': ({ id }) => s().notes.get(id),
    'notes:create': (input) => s().notes.create(input),
    'notes:update': (input) => s().notes.update(input),
    'notes:move': (input) => s().notes.move(input),
    'notes:setFolder': (input) => s().notes.setFolder(input),
    'notes:duplicate': ({ id }) => s().notes.duplicate(id),
    'notes:archive': ({ id }) => s().notes.archive(id),
    'notes:unarchive': ({ id }) => s().notes.unarchive(id),
    'notes:import': (input) => s().notes.import(input),
    // The saved body goes to the clipboard from here, so the renderer needs no clipboard access.
    'notes:copyMarkdown': ({ id }) => {
      clipboard.writeText(s().notes.get(id).body);
      return null;
    },
    'notes:exportMarkdown': async ({ id }) => {
      const note = s().notes.get(id);
      const destination = await dialogs.saveFile(markdownFileName(note.title), MARKDOWN_FILTER);
      if (!destination) return { saved: false };
      writeNoteMarkdown(note, destination);
      return { saved: true, fileName: path.basename(destination) };
    },
    'notes:backlinks': ({ id }) => s().notes.backlinks(id),
    'notes:linkMention': (input) => s().notes.linkMention(input),
    'links:resolve': (input) => s().links.resolve(input),
    'links:mentionedIn': (target) => s().links.mentionedIn(target),
    'attachments:add': (input) => s().attachments.add(input),
    'attachments:info': ({ ids }) => s().attachments.info(ids),
    'attachments:readImage': ({ id }) => s().attachments.readImage(id),
    'attachments:save': async ({ id }) => {
      const file = s().attachments.read(id);
      const extension = path.extname(file.name).slice(1);
      const destination = await dialogs.saveFile(
        file.name,
        extension ? { name: `${extension.toUpperCase()} file`, extension } : ANY_FILE,
      );
      if (!destination) return { saved: false };
      writeFileAtomic(destination, file.data);
      return { saved: true, fileName: path.basename(destination) };
    },
    // Opens a copy with the system's default app. Executable files are never opened from here.
    'attachments:open': async ({ id }) => {
      const [info] = s().attachments.info([id]);
      if (!info || info.missing) throw new AppError('NOT_FOUND', 'File not found.');
      if (info.executable) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Files that run programs cannot be opened from a note. Save a copy instead.',
        );
      }
      const file = s().attachments.read(id);
      const dir = path.join(files.tempDir, 'open', id);
      fs.mkdirSync(dir, { recursive: true });
      const copy = path.join(dir, file.name);
      writeFileAtomic(copy, file.data);
      const problem = await files.openPath(copy);
      if (problem)
        throw new AppError('VALIDATION_FAILED', `The file could not be opened. ${problem}`);
      return null;
    },
    'noteFolders:list': () => s().noteFolders.list(),
    'noteFolders:create': (input) => s().noteFolders.create(input),
    'noteFolders:rename': (input) => s().noteFolders.rename(input),
    'noteFolders:delete': ({ id }) => (s().noteFolders.delete(id), null),

    'dependencies:list': ({ taskId }) => ({
      prerequisites: s().dependencies.prerequisites(taskId),
      dependents: s().dependencies.dependents(taskId),
    }),
    'dependencies:add': (input) => (s().dependencies.add(input), null),
    'dependencies:remove': (input) => (s().dependencies.remove(input), null),

    'trash:list': () => s().trash.list(),
    'trash:previewTask': ({ id }) => s().trash.previewTaskTrash(id),
    'trash:trashTask': ({ id }) => s().trash.trashTask(id),
    'trash:trashProject': ({ id }) => s().trash.trashProject(id),
    'trash:trashNote': ({ id }) => s().trash.trashNote(id),
    'trash:restore': ({ batchId }) => s().trash.restore(batchId),
    'trash:deletePermanently': ({ batchId }) => (s().trash.deletePermanently(batchId), null),
    'trash:empty': () => ({ removed: s().trash.empty() }),

    'search:query': ({ text }) => s().search.search(text),
  };
}
