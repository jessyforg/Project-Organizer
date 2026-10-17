import { useState } from 'react';
import { ChevronDown, ChevronRight, Link2, ListTree, Tag as TagIcon } from 'lucide-react';
import type { Project, StatusCategory, Tag, Task, WorkflowStatus } from '@shared/domain';
import { useNavigation } from '../../app/navigation';
import { PriorityLabel, Swatch } from '../../components/ui';
import { CATEGORY_LABEL, describeDue } from '../../lib/format';
import { CompleteCheckbox } from './CompleteCheckbox';

export type Grouping =
  { kind: 'category' } | { kind: 'statuses'; statuses: WorkflowStatus[] } | { kind: 'none' };

interface Group {
  key: string;
  label: string;
  closed: boolean;
  tasks: Task[];
}

const CATEGORY_ORDER: StatusCategory[] = ['in_progress', 'todo', 'done', 'cancelled'];

function groupTasks(tasks: Task[], grouping: Grouping): Group[] {
  if (grouping.kind === 'none') return [{ key: 'all', label: '', closed: false, tasks }];
  if (grouping.kind === 'category') {
    return CATEGORY_ORDER.map((category) => ({
      key: category,
      label: CATEGORY_LABEL[category],
      closed: category === 'done' || category === 'cancelled',
      tasks: tasks.filter((t) => t.statusCategory === category),
    })).filter((g) => g.tasks.length > 0);
  }
  return grouping.statuses
    .map((status) => ({
      key: status.id,
      label: status.name,
      closed: status.category === 'done' || status.category === 'cancelled',
      tasks: tasks.filter((t) => t.statusId === status.id),
    }))
    .filter((g) => g.tasks.length > 0);
}

interface Props {
  tasks: Task[];
  grouping: Grouping;
  today: string;
  /** Show undated tasks under a separate heading (used when sorting by due date). */
  separateUndated?: boolean;
  projects?: Map<string, Project>;
  tags?: Map<string, Tag>;
  label: string;
}

export function TaskList({
  tasks,
  grouping,
  today,
  separateUndated,
  projects,
  tags,
  label,
}: Props) {
  const groups = groupTasks(tasks, grouping);
  return (
    <div className="section" aria-label={label}>
      {groups.map((group) => (
        <TaskGroup
          key={group.key}
          group={group}
          today={today}
          separateUndated={separateUndated ?? false}
          projects={projects}
          tags={tags}
        />
      ))}
    </div>
  );
}

function TaskGroup({
  group,
  today,
  separateUndated,
  projects,
  tags,
}: {
  group: Group;
  today: string;
  separateUndated: boolean;
  projects: Map<string, Project> | undefined;
  tags: Map<string, Tag> | undefined;
}) {
  const [expanded, setExpanded] = useState(!group.closed);
  const firstUndated = separateUndated ? group.tasks.findIndex((t) => t.dueDate === null) : -1;
  const listId = `group-${group.key}`;
  return (
    <div className="task-group">
      {group.label && (
        <button
          type="button"
          className="task-group__header"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          {group.label} <span className="muted">{group.tasks.length}</span>
        </button>
      )}
      {expanded && (
        <ul className="task-list" id={listId} aria-label={group.label || undefined}>
          {group.tasks.map((task, index) => (
            <TaskRowWithDivider
              key={task.id}
              task={task}
              today={today}
              showDivider={index === firstUndated && index > 0}
              project={projects?.get(task.projectId)}
              tags={tags}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRowWithDivider({
  showDivider,
  ...props
}: Parameters<typeof TaskRow>[0] & { showDivider: boolean }) {
  return (
    <>
      {showDivider && (
        <li className="undated-divider" aria-hidden="true">
          No due date
        </li>
      )}
      <TaskRow {...props} />
    </>
  );
}

export function TaskRow({
  task,
  today,
  project,
  tags,
}: {
  task: Task;
  today: string;
  project?: Project | undefined;
  tags?: Map<string, Tag> | undefined;
}) {
  const { openTaskId, openTask } = useNavigation();
  const done = task.statusCategory === 'done';
  const due = task.dueDate ? describeDue(task.dueDate, today, task.statusCategory) : null;
  const tagNames = task.tagIds
    .map((id) => tags?.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));

  return (
    <li
      className={`task-row${done ? ' task-row--done' : ''}`}
      aria-current={openTaskId === task.id ? 'true' : undefined}
    >
      <CompleteCheckbox task={task} />
      <button type="button" className="task-row__main" onClick={() => openTask(task.id)}>
        <span className="task-row__title">{task.title}</span>
        <span className="task-row__meta">
          {project && (
            <span>
              <Swatch color={project.color} />
              {project.name}
            </span>
          )}
          {task.subtaskCount > 0 && (
            <span>
              <ListTree aria-hidden />
              {task.completedSubtaskCount}/{task.subtaskCount} subtasks
            </span>
          )}
          {task.prerequisiteIds.length > 0 && (
            <span>
              <Link2 aria-hidden />
              Waiting on {task.prerequisiteIds.length}
            </span>
          )}
          {tagNames.length > 0 && (
            <span>
              <TagIcon aria-hidden />
              {tagNames.join(', ')}
            </span>
          )}
        </span>
      </button>
      <span className="task-row__side">
        <PriorityLabel priority={task.priority} />
        {due && <span className={`due due--${due.state}`}>{due.label}</span>}
      </span>
    </li>
  );
}
