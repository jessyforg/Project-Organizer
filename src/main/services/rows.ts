import type {
  ColorToken,
  Folder,
  Priority,
  Project,
  ProjectKind,
  ProjectState,
  StatusCategory,
  Tag,
  Task,
  WorkflowStatus,
} from '@shared/domain';

/** SQL fragments and row mappers shared by the services. Column lists stay in one place. */

function idList(json: string): string[] {
  return (JSON.parse(json) as string[]).sort();
}

export interface FolderRow {
  id: string;
  name: string;
  sort_key: number;
  created_at: string;
  updated_at: string;
}

export const FOLDER_SELECT = 'SELECT id, name, sort_key, created_at, updated_at FROM folders';

export function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    sortKey: row.sort_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export const TAG_SELECT = 'SELECT id, name, color, created_at, updated_at FROM tags';

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color as ColorToken | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface StatusRow {
  id: string;
  project_id: string;
  name: string;
  category: string;
  sort_key: number;
  is_default: number;
}

export const STATUS_SELECT =
  'SELECT id, project_id, name, category, sort_key, is_default FROM project_statuses';

export function toStatus(row: StatusRow): WorkflowStatus {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    category: row.category as StatusCategory,
    sortKey: row.sort_key,
    isDefault: row.is_default === 1,
  };
}

export interface ProjectRow {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  kind: string;
  status: string;
  is_inbox: number;
  color: string | null;
  start_date: string | null;
  target_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  tag_ids: string;
}

export const PROJECT_SELECT = `
  SELECT p.id, p.folder_id, p.name, p.description, p.kind, p.status, p.is_inbox, p.color,
         p.start_date, p.target_date, p.archived_at, p.created_at, p.updated_at,
         (SELECT json_group_array(tag_id) FROM project_tags WHERE project_id = p.id) AS tag_ids
  FROM projects p`;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    description: row.description,
    kind: row.kind as ProjectKind,
    status: row.status as ProjectState,
    isInbox: row.is_inbox === 1,
    color: row.color as ColorToken | null,
    startDate: row.start_date,
    targetDate: row.target_date,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tagIds: idList(row.tag_ids),
  };
}

export interface TaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  status_id: string;
  status_category: string;
  title: string;
  description: string | null;
  priority: string | null;
  start_date: string | null;
  due_date: string | null;
  sort_key: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  tag_ids: string;
  prerequisite_ids: string;
  subtask_count: number;
  completed_subtask_count: number;
}

export const TASK_SELECT = `
  SELECT t.id, t.project_id, t.parent_task_id, t.status_id, s.category AS status_category,
         t.title, t.description, t.priority, t.start_date, t.due_date, t.sort_key,
         t.completed_at, t.created_at, t.updated_at,
         (SELECT json_group_array(tag_id) FROM task_tags WHERE task_id = t.id) AS tag_ids,
         (SELECT json_group_array(depends_on_task_id) FROM task_dependencies WHERE task_id = t.id)
           AS prerequisite_ids,
         (SELECT count(*) FROM tasks c WHERE c.parent_task_id = t.id AND c.deleted_at IS NULL)
           AS subtask_count,
         (SELECT count(*) FROM tasks c JOIN project_statuses cs ON cs.id = c.status_id
           WHERE c.parent_task_id = t.id AND c.deleted_at IS NULL AND cs.category = 'done')
           AS completed_subtask_count
  FROM tasks t
  JOIN project_statuses s ON s.id = t.status_id
  JOIN projects p ON p.id = t.project_id`;

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    parentTaskId: row.parent_task_id,
    statusId: row.status_id,
    statusCategory: row.status_category as StatusCategory,
    title: row.title,
    description: row.description,
    priority: row.priority as Priority | null,
    startDate: row.start_date,
    dueDate: row.due_date,
    sortKey: row.sort_key,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tagIds: idList(row.tag_ids),
    prerequisiteIds: idList(row.prerequisite_ids),
    subtaskCount: row.subtask_count,
    completedSubtaskCount: row.completed_subtask_count,
  };
}

/** Sorts Urgent → High → Medium → Low → no priority. */
export const PRIORITY_RANK_SQL = `CASE t.priority
  WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;
