import type { AppInfo } from '@shared/types';
import type { ProfileService } from '../profiles/profile-service';
import type { ProfileServices } from '../services';
import type { ChannelImpls } from './handler';

export interface ChannelDeps {
  appInfo: () => AppInfo;
  profiles: ProfileService;
  /** Services bound to the open profile; throws NOT_FOUND when no profile is open. */
  services: () => ProfileServices;
}

/** One implementation per channel; the mapped type makes a missing channel a compile error. */
export function createChannelImpls({ appInfo, profiles, services: s }: ChannelDeps): ChannelImpls {
  return {
    'app:getInfo': () => appInfo(),
    'profiles:list': () => profiles.list(),
    'profiles:getActive': () => profiles.getActive(),
    'profiles:create': ({ displayName }) => profiles.create(displayName),
    'profiles:rename': ({ id, displayName }) => profiles.rename(id, displayName),
    'profiles:switch': ({ id }) => profiles.switchTo(id),

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
    'tags:setTaskTags': ({ taskId, tagIds }) => (s().tags.setTaskTags(taskId, tagIds), null),
    'tags:setProjectTags': ({ projectId, tagIds }) => (
      s().tags.setProjectTags(projectId, tagIds),
      null
    ),

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
    'trash:restore': ({ batchId }) => s().trash.restore(batchId),
    'trash:deletePermanently': ({ batchId }) => (s().trash.deletePermanently(batchId), null),
    'trash:empty': () => ({ removed: s().trash.empty() }),

    'search:query': ({ text }) => s().search.search(text),
  };
}
