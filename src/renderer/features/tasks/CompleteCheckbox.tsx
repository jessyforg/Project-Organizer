import { useState } from 'react';
import type { StatusCategory, Task } from '@shared/domain';
import { useTaskActions } from './useTaskActions';

/**
 * The completion checkbox. It reflects the click immediately and keeps showing it until
 * the reloaded task catches up; if saving fails it reverts to the saved state.
 */
export function CompleteCheckbox({ task }: { task: Task }) {
  const { toggleCompleted } = useTaskActions();
  const [pending, setPending] = useState<{ checked: boolean; from: StatusCategory } | null>(null);
  const done = task.statusCategory === 'done';
  // The optimistic value applies only while the task still shows the state it was clicked in.
  const checked = pending && pending.from === task.statusCategory ? pending.checked : done;

  return (
    <input
      type="checkbox"
      className="task-row__check"
      checked={checked}
      disabled={task.statusCategory === 'cancelled'}
      aria-label={`Done: ${task.title}`}
      onChange={() => {
        setPending({ checked: !done, from: task.statusCategory });
        void toggleCompleted(task).then((saved) => {
          if (!saved) setPending(null);
        });
      }}
    />
  );
}
