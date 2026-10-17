import type { Dashboard } from '@shared/domain';
import { daysBefore } from '../domain/dates';
import { today, type ServiceContext } from './context';
import { ProjectService } from './projects';
import { TaskService } from './tasks';

const SECTION_LIMIT = 8;
const OPEN = ['todo', 'in_progress'] as const;

/** Every number on the dashboard is computed from the profile's data (no sample values). */
export class DashboardService {
  private readonly tasks: TaskService;
  private readonly projects: ProjectService;

  constructor(private readonly ctx: ServiceContext) {
    this.tasks = new TaskService(ctx);
    this.projects = new ProjectService(ctx);
  }

  get(): Dashboard {
    const { db } = this.ctx;
    const counts = db
      .prepare(
        `SELECT
           sum(CASE WHEN s.category IN ('todo', 'in_progress') THEN 1 ELSE 0 END) AS open_count,
           sum(CASE WHEN t.completed_at >= ? THEN 1 ELSE 0 END) AS completed_week
         FROM tasks t
         JOIN project_statuses s ON s.id = t.status_id
         JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.archived_at IS NULL`,
      )
      .get(daysBefore(this.ctx.clock(), 7)) as {
      open_count: number | null;
      completed_week: number | null;
    };

    return {
      today: today(this.ctx),
      overdue: this.tasks.list({ due: 'overdue', sort: 'due', limit: SECTION_LIMIT }),
      dueToday: this.tasks.list({
        due: 'today',
        statusCategories: [...OPEN],
        sort: 'priority',
        limit: SECTION_LIMIT,
      }),
      upcoming: this.tasks.list({
        due: 'upcoming',
        statusCategories: [...OPEN],
        sort: 'due',
        limit: SECTION_LIMIT,
      }),
      recentlyUpdated: this.tasks.list({ sort: 'updated', limit: SECTION_LIMIT }),
      recentlyCompleted: this.tasks.list({
        statusCategories: ['done'],
        sort: 'completed',
        limit: 5,
      }),
      activeProjects: this.projects
        .listWithProgress()
        .filter((p) => p.status === 'active' && !p.isInbox),
      openTaskCount: counts.open_count ?? 0,
      completedThisWeek: counts.completed_week ?? 0,
    };
  }
}
