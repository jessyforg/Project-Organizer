import { useCallback } from 'react';
import type { Task, TaskNotice, TaskUpdateResult } from '@shared/domain';
import type { Result } from '@shared/result';
import { useInvalidate } from '../../app/data';
import { useToast } from '../../app/toasts';
import { plural } from '../../lib/format';

/** Task mutations with consistent feedback: errors and notices become toasts, data reloads. */
export function useTaskActions() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const showNotices = useCallback(
    (notices: TaskNotice[]) => {
      for (const notice of notices) {
        switch (notice.type) {
          case 'unfinished_prerequisites':
            toast({
              message: `This task is waiting on ${plural(notice.taskIds.length, 'unfinished task')}.`,
            });
            break;
          case 'parent_may_be_complete':
            toast({
              message: 'All subtasks are done.',
              actions: [
                {
                  label: 'Complete parent task',
                  run: async () => {
                    const r = await window.api.tasks.setCompleted({
                      id: notice.taskId,
                      completed: true,
                    });
                    if (!r.ok) toast({ message: r.error.message, tone: 'error' });
                    invalidate();
                  },
                },
              ],
            });
            break;
          case 'project_may_be_complete':
            toast({
              message: 'Every task in this project is done.',
              actions: [
                {
                  label: 'Mark project completed',
                  run: async () => {
                    const r = await window.api.projects.setStatus({
                      id: notice.projectId,
                      status: 'completed',
                    });
                    if (!r.ok) toast({ message: r.error.message, tone: 'error' });
                    invalidate();
                  },
                },
              ],
            });
            break;
          case 'completed_project_has_open_tasks':
            toast({
              message: 'This project is marked completed but has open tasks again.',
              actions: [
                {
                  label: 'Mark project active',
                  run: async () => {
                    const r = await window.api.projects.setStatus({
                      id: notice.projectId,
                      status: 'active',
                    });
                    if (!r.ok) toast({ message: r.error.message, tone: 'error' });
                    invalidate();
                  },
                },
              ],
            });
            break;
        }
      }
    },
    [toast, invalidate],
  );

  /** Applies a task update result; returns true on success. */
  const applyUpdate = useCallback(
    (result: Result<TaskUpdateResult>): boolean => {
      invalidate();
      if (!result.ok) {
        toast({ message: result.error.message, tone: 'error' });
        return false;
      }
      showNotices(result.data.notices);
      return true;
    },
    [invalidate, toast, showNotices],
  );

  const toggleCompleted = useCallback(
    async (task: Task): Promise<boolean> => {
      const completed = task.statusCategory !== 'done';
      return applyUpdate(await window.api.tasks.setCompleted({ id: task.id, completed }));
    },
    [applyUpdate],
  );

  return { toggleCompleted, applyUpdate, showNotices };
}
