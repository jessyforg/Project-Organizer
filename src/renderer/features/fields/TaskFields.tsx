import { useId, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { CustomField, CustomValue, Task } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { FieldsDialog } from './FieldsDialog';
import { fieldEditValue, parseFieldEdit } from './field-values';

/** The task panel's "Fields" section: one editor per custom field (ADR-0023). */
export function TaskFields({ task, projectName }: { task: Task; projectName: string }) {
  const fields = useQuery(`custom-fields:${task.projectId}`, () =>
    window.api.customFields.list({ projectId: task.projectId }),
  );
  const [managing, setManaging] = useState(false);
  const list = fields.data ?? [];
  return (
    <section className="section" aria-labelledby={`fields-${task.id}`}>
      <div className="section__header">
        <h3 id={`fields-${task.id}`}>Fields</h3>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={() => setManaging(true)}
        >
          <SlidersHorizontal aria-hidden /> Manage fields
        </button>
      </div>
      {fields.data && list.length === 0 && (
        <p className="muted small">This project has no custom fields yet.</p>
      )}
      {list.length > 0 && (
        <div className="task-fields">
          {list.map((field) => (
            <FieldInput
              key={`${field.id}:${field.type}`}
              task={task}
              field={field}
              value={task.customValues[field.id]}
            />
          ))}
        </div>
      )}
      <FieldsDialog
        open={managing}
        projectId={task.projectId}
        projectName={projectName}
        onClose={() => setManaging(false)}
      />
    </section>
  );
}

function FieldInput({
  task,
  field,
  value,
}: {
  task: Task;
  field: CustomField;
  value: CustomValue | undefined;
}) {
  const id = useId();
  const invalidate = useInvalidate();
  const toast = useToast();
  const initial = fieldEditValue(field, value);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Adopt saved changes (after a save or an undo elsewhere).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setText(initial);
  }

  const save = async (next: CustomValue | null) => {
    const result = await window.api.customFields.setValue({
      taskId: task.id,
      fieldId: field.id,
      value: next,
    });
    invalidate();
    if (!result.ok) {
      setError(result.error.message);
      toast({ message: result.error.message, tone: 'error' });
    } else setError(null);
  };

  const commitText = () => {
    if (text === initial) return;
    const parsed = parseFieldEdit(field, text);
    if (parsed === undefined) return setError(`“${field.name}” needs a number.`);
    void save(parsed);
  };

  const inputId = `${id}-input`;
  const describedBy = error ? `${id}-error` : undefined;
  let control;
  switch (field.type) {
    case 'checkbox':
      control = (
        <label className="task-fields__check">
          <input
            id={inputId}
            type="checkbox"
            checked={text === 'yes'}
            onChange={(e) => {
              // Shown at once; the saved value takes over once it has reloaded.
              setText(e.target.checked ? 'yes' : '');
              void save(e.target.checked);
            }}
          />
          {field.name}
        </label>
      );
      break;
    case 'select':
      control = (
        <select
          id={inputId}
          className="select"
          value={text}
          aria-describedby={describedBy}
          onChange={(e) => void save(e.target.value || null)}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'multi_select': {
      // Kept as "id,id" in the editor's text, so a click shows at once.
      const chosen = text ? text.split(',') : [];
      control = (
        <div className="task-fields__choices" role="group" aria-labelledby={`${id}-label`}>
          {field.options.map((o) => (
            <label key={o.id} className="chip">
              <input
                type="checkbox"
                checked={chosen.includes(o.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...chosen, o.id]
                    : chosen.filter((c) => c !== o.id);
                  setText(next.join(','));
                  void save(next);
                }}
              />
              {o.label}
            </label>
          ))}
          {field.options.length === 0 && <span className="muted small">No choices yet.</span>}
        </div>
      );
      break;
    }
    default:
      control = (
        <input
          id={inputId}
          className="input"
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={text}
          maxLength={field.type === 'text' ? 1000 : undefined}
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      );
  }

  return (
    <div className="field">
      {field.type !== 'checkbox' &&
        (field.type === 'multi_select' ? (
          <span id={`${id}-label`} className="field__label">
            {field.name}
          </span>
        ) : (
          <label htmlFor={inputId}>{field.name}</label>
        ))}
      {control}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
