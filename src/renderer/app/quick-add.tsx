import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { PRIORITIES, type Priority } from '@shared/domain';
import { Dialog } from '../components/ui';
import { useLookups } from '../features/tasks/useLookups';
import { PRIORITY_LABEL } from '../lib/format';
import { useInvalidate } from './data';
import { useNavigation } from './navigation';
import { useToast } from './toasts';

type OpenQuickAdd = (defaults?: { projectId?: string }) => void;

const QuickAddContext = createContext<OpenQuickAdd>(() => undefined);

export function useQuickAdd(): OpenQuickAdd {
  return useContext(QuickAddContext);
}

/** Global "New task" dialog (Ctrl+N). Tasks go to the Inbox unless a project is chosen. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; projectId: string }>({
    open: false,
    projectId: '',
  });
  const open = useCallback<OpenQuickAdd>(
    (defaults) => setState({ open: true, projectId: defaults?.projectId ?? '' }),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return (
    <QuickAddContext.Provider value={open}>
      {children}
      <Dialog open={state.open} onClose={close} label="New task">
        <QuickAddForm initialProjectId={state.projectId} onDone={close} />
      </Dialog>
    </QuickAddContext.Provider>
  );
}

export function QuickAddForm({
  initialProjectId,
  onDone,
}: {
  initialProjectId: string;
  onDone: () => void;
}) {
  const id = useId();
  const { projectList } = useLookups();
  const invalidate = useInvalidate();
  const toast = useToast();
  const { openTask } = useNavigation();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [priority, setPriority] = useState<Priority | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Enter a title for the task.');
      return;
    }
    setBusy(true);
    const result = await window.api.tasks.create({
      title,
      ...(projectId ? { projectId } : {}),
      ...(priority ? { priority } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    invalidate();
    onDone();
    const created = result.data;
    toast({
      message: 'Task added.',
      actions: [{ label: 'Open task', run: () => openTask(created.id) }],
    });
  };

  const activeProjects = projectList.filter((p) => p.archivedAt === null);

  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>New task</h2>
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          className="input"
          value={title}
          maxLength={500}
          autoFocus
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`${id}-error`} className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="task-details__grid">
        <div className="field">
          <label htmlFor={`${id}-project`}>Project</label>
          <select
            id={`${id}-project`}
            className="select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Inbox</option>
            {activeProjects
              .filter((p) => !p.isInbox)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-priority`}>Priority</label>
          <select
            id={`${id}-priority`}
            className="select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | '')}
          >
            <option value="">No priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-due`}>Due date</label>
          <input
            id={`${id}-due`}
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Add task
        </button>
      </div>
    </form>
  );
}
