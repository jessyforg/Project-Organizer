import type { Logger } from '../platform/logger';
import type { ServiceContext } from './context';
import { DependencyService } from './dependencies';
import { FolderService } from './folders';
import { ensureInbox, ProjectService } from './projects';
import { SearchService } from './search';
import { StatusService } from './statuses';
import { TagService } from './tags';
import { TaskService } from './tasks';
import { TrashService } from './trash';

export type { ServiceContext } from './context';

export interface ProfileServices {
  folders: FolderService;
  tags: TagService;
  projects: ProjectService;
  statuses: StatusService;
  tasks: TaskService;
  dependencies: DependencyService;
  trash: TrashService;
  search: SearchService;
}

export function createProfileServices(ctx: ServiceContext): ProfileServices {
  return {
    folders: new FolderService(ctx),
    tags: new TagService(ctx),
    projects: new ProjectService(ctx),
    statuses: new StatusService(ctx),
    tasks: new TaskService(ctx),
    dependencies: new DependencyService(ctx),
    trash: new TrashService(ctx),
    search: new SearchService(ctx),
  };
}

/**
 * Runs when a profile opens and once a day while it stays open:
 * makes sure the Inbox exists and purges trash older than 30 days.
 */
export function runProfileMaintenance(ctx: ServiceContext, logger: Logger): void {
  ensureInbox(ctx);
  const purged = new TrashService(ctx).purgeExpired();
  if (purged > 0) logger.info('trash.purged', { batches: purged });
}
