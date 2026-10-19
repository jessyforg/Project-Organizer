import { pruneSnapshots, takeDailySnapshot } from '../backup/snapshots';
import type { Logger } from '../platform/logger';
import type { ServiceContext } from './context';
import { DashboardService } from './dashboard';
import { DependencyService } from './dependencies';
import { FolderService } from './folders';
import { NoteService } from './notes';
import { ensureInbox, ProjectService } from './projects';
import { SearchService } from './search';
import { SettingsService } from './settings';
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
  notes: NoteService;
  dependencies: DependencyService;
  trash: TrashService;
  search: SearchService;
  settings: SettingsService;
  dashboard: DashboardService;
}

export function createProfileServices(ctx: ServiceContext): ProfileServices {
  return {
    folders: new FolderService(ctx),
    tags: new TagService(ctx),
    projects: new ProjectService(ctx),
    statuses: new StatusService(ctx),
    tasks: new TaskService(ctx),
    notes: new NoteService(ctx),
    dependencies: new DependencyService(ctx),
    trash: new TrashService(ctx),
    search: new SearchService(ctx),
    settings: new SettingsService(ctx),
    dashboard: new DashboardService(ctx),
  };
}

/**
 * Runs when a profile opens and once a day while it stays open:
 * makes sure the Inbox exists and purges trash older than 30 days.
 */
export function runProfileMaintenance(
  ctx: ServiceContext,
  logger: Logger,
  options: { snapshotDir?: string } = {},
): void {
  ensureInbox(ctx);
  const purged = new TrashService(ctx).purgeExpired();
  if (purged > 0) logger.info('trash.purged', { batches: purged });
  if (options.snapshotDir) {
    // A failed snapshot must not stop the profile from opening; it is logged and retried later.
    try {
      if (takeDailySnapshot(ctx.db, options.snapshotDir, ctx.clock())) {
        logger.info('snapshot.daily_created');
      }
      pruneSnapshots(options.snapshotDir);
    } catch (error) {
      logger.error('snapshot.daily_failed', error);
    }
  }
}
