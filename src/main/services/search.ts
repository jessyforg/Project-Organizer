import type { SearchResults } from '@shared/domain';
import { toFtsQuery } from '../domain/fts';
import type { ServiceContext } from './context';
import { PROJECT_SELECT, toProject, type ProjectRow } from './rows';
import { TaskService } from './tasks';

const PROJECT_LIMIT = 20;
const TASK_LIMIT = 50;

/** Global search across live projects and tasks, including archived projects (R06). */
export class SearchService {
  private readonly tasks: TaskService;

  constructor(private readonly ctx: ServiceContext) {
    this.tasks = new TaskService(ctx);
  }

  search(text: string): SearchResults {
    const fts = toFtsQuery(text);
    if (fts === null) return { projects: [], tasks: [] };
    const projects = this.ctx.db
      .prepare(
        `${PROJECT_SELECT}
         WHERE p.deleted_at IS NULL
           AND p.id IN (SELECT project_id FROM projects_fts WHERE projects_fts MATCH ?)
         ORDER BY p.archived_at IS NOT NULL, p.name COLLATE NOCASE
         LIMIT ?`,
      )
      .all(fts, PROJECT_LIMIT) as ProjectRow[];
    return {
      projects: projects.map(toProject),
      tasks: this.tasks.list({ text, includeArchived: true, limit: TASK_LIMIT }),
    };
  }
}
