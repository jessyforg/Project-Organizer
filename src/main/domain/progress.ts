import type { Progress, StatusCategory } from '@shared/domain';

export interface ProgressTask {
  id: string;
  parentTaskId: string | null;
  category: StatusCategory;
}

/**
 * Leaf-counting progress (docs/DATA_MODEL.md §5).
 * - A task with live subtasks is not counted; its subtasks are.
 * - Cancelled leaves are excluded from both numerator and denominator.
 * - With nothing countable, the ratio is null rather than 0% or 100%.
 * Callers pass live (non-trashed) tasks only.
 */
export function computeProgress(tasks: readonly ProgressTask[]): Progress {
  const parents = new Set<string>();
  for (const task of tasks) if (task.parentTaskId !== null) parents.add(task.parentTaskId);

  let done = 0;
  let total = 0;
  for (const task of tasks) {
    if (parents.has(task.id) || task.category === 'cancelled') continue;
    total++;
    if (task.category === 'done') done++;
  }
  return { done, total, ratio: total === 0 ? null : done / total };
}
