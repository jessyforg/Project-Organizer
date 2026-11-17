import { useId, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { CUSTOM_FIELD_TYPES, type CustomField, type CustomFieldType } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { plural } from '../../lib/format';
import { TYPE_LABEL } from './field-values';

/**
 * Add, rename, reorder, and remove a project's custom fields; edit choices; change a field's
 * type, which is refused with the blocking values when they do not convert (ADR-0023).
 */
export function FieldsDialog({
  open,
  projectId,
  projectName,
  onClose,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} label="Custom fields" wide>
      {open && <FieldsEditor projectId={projectId} projectName={projectName} onClose={onClose} />}
    </Dialog>
  );
}

function FieldsEditor({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const fields = useQuery(`custom-fields:${projectId}`, () =>
    window.api.customFields.list({ projectId }),
  );
  const invalidate = useInvalidate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [trashing, setTrashing] = useState<CustomField | null>(null);
  /**
   * The field just moved to the trash. Its Undo is shown here, not in a toast: this dialog is
   * modal, so the rest of the window (toasts included) cannot be used while it is open.
   */
  const [trashed, setTrashed] = useState<{ name: string; batchId: string } | null>(null);
  const list = fields.data ?? [];

  /** Runs a change; a refusal is shown beside the field it concerns. */
  const run = async (
    key: string,
    change: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ): Promise<boolean> => {
    const result = await change();
    invalidate();
    setErrors((e) => ({ ...e, [key]: result.ok ? '' : (result.error?.message ?? '') }));
    return result.ok;
  };

  const move = (index: number, step: -1 | 1) => {
    const ids = list.map((f) => f.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + step, 0, id!);
    void run('order', () => window.api.customFields.reorder({ projectId, ids }));
  };

  const trash = async (field: CustomField) => {
    setTrashing(null);
    const result = await window.api.trash.trashCustomField({ id: field.id });
    invalidate();
    setErrors((e) => ({ ...e, [field.id]: result.ok ? '' : result.error.message }));
    if (result.ok) setTrashed({ name: field.name, batchId: result.data.batchId });
  };

  const undoTrash = async () => {
    if (!trashed) return;
    const ok = await run('restore', () => window.api.trash.restore({ batchId: trashed.batchId }));
    if (ok) setTrashed(null);
  };

  return (
    <div className="dialog__form">
      <h2>Custom fields in {projectName}</h2>
      <p className="dialog__body">
        Fields every task in this project can have. Changing a field&rsquo;s type keeps every value,
        or changes nothing and says which values do not fit.
      </p>
      {list.length === 0 && fields.data && <p className="muted">No fields yet.</p>}
      {trashed && (
        <div className="notice" role="status">
          <p>“{trashed.name}” moved to trash. Its values come back if you restore it.</p>
          <button type="button" className="btn" onClick={() => void undoTrash()}>
            Undo
          </button>
        </div>
      )}
      {errors['restore'] && (
        <p className="field__error" role="alert">
          {errors['restore']}
        </p>
      )}
      {errors['order'] && (
        <p className="field__error" role="alert">
          {errors['order']}
        </p>
      )}
      <ul className="fields-list" aria-label="Fields">
        {list.map((field, index) => (
          <FieldRow
            key={`${field.id}:${field.name}:${field.type}:${field.options.map((o) => o.label).join('|')}`}
            field={field}
            first={index === 0}
            last={index === list.length - 1}
            error={errors[field.id] ?? ''}
            onRun={(change) => run(field.id, change)}
            onMove={(step) => move(index, step)}
            onTrash={() => setTrashing(field)}
          />
        ))}
      </ul>
      <NewField
        projectId={projectId}
        onRun={(change) => run('new', change)}
        error={errors['new'] ?? ''}
      />
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
      <ConfirmDialog
        open={trashing !== null}
        title={`Move “${trashing?.name ?? ''}” to the trash?`}
        body={
          trashing && trashing.valueCount > 0
            ? `${plural(trashing.valueCount, 'task has', 'tasks have')} a value. The values come back if you restore the field from Trash within 30 days.`
            : 'You can restore it from Trash for 30 days.'
        }
        confirmLabel="Move to trash"
        danger
        onCancel={() => setTrashing(null)}
        onConfirm={() => trashing && void trash(trashing)}
      />
    </div>
  );
}

type Run = (
  change: () => Promise<{ ok: boolean; error?: { message: string } }>,
) => Promise<boolean>;

function FieldRow({
  field,
  first,
  last,
  error,
  onRun,
  onMove,
  onTrash,
}: {
  field: CustomField;
  first: boolean;
  last: boolean;
  error: string;
  onRun: Run;
  onMove: (step: -1 | 1) => void;
  onTrash: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(field.name);
  const [newOption, setNewOption] = useState('');
  const choices = field.type === 'select' || field.type === 'multi_select';
  const saveOptions = (options: { id?: string; label: string }[]) =>
    onRun(() => window.api.customFields.update({ id: field.id, options }));

  return (
    <li className="fields-list__item">
      <div className="fields-list__row">
        <label className="visually-hidden" htmlFor={`${id}-name`}>
          Name of field {field.name}
        </label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== field.name) {
              void onRun(() => window.api.customFields.update({ id: field.id, name }));
            } else setName(field.name);
          }}
        />
        <label className="visually-hidden" htmlFor={`${id}-type`}>
          Type of field {field.name}
        </label>
        <select
          id={`${id}-type`}
          className="select"
          value={field.type}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) =>
            void onRun(() =>
              window.api.customFields.changeType({
                id: field.id,
                type: e.target.value as CustomFieldType,
              }),
            )
          }
        >
          {CUSTOM_FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <span className="muted small">{plural(field.valueCount, 'value')}</span>
        <span className="fields-list__actions">
          <button
            type="button"
            className="btn btn--quiet btn--icon btn--small"
            aria-label={`Move ${field.name} up`}
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--icon btn--small"
            aria-label={`Move ${field.name} down`}
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--icon btn--small"
            aria-label={`Move ${field.name} to trash`}
            onClick={onTrash}
          >
            <Trash2 aria-hidden />
          </button>
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
      {choices && (
        <div className="fields-list__options" role="group" aria-label={`Choices of ${field.name}`}>
          {field.options.map((option) => (
            <span key={option.id} className="chip fields-list__option">
              {option.label}
              <button
                type="button"
                className="btn btn--quiet btn--icon btn--small"
                aria-label={`Remove choice ${option.label}`}
                onClick={() => void saveOptions(field.options.filter((o) => o.id !== option.id))}
              >
                <X aria-hidden />
              </button>
            </span>
          ))}
          <form
            className="fields-list__add-option"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newOption.trim()) return;
              void saveOptions([...field.options, { label: newOption }]).then((ok) => {
                if (ok) setNewOption('');
              });
            }}
          >
            <label className="visually-hidden" htmlFor={`${id}-option`}>
              New choice for {field.name}
            </label>
            <input
              id={`${id}-option`}
              className="input input--small"
              placeholder="Add a choice, then Enter"
              maxLength={60}
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
            />
          </form>
        </div>
      )}
    </li>
  );
}

function NewField({ projectId, onRun, error }: { projectId: string; onRun: Run; error: string }) {
  const id = useId();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const choices =
      type === 'select' || type === 'multi_select'
        ? options
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
    const ok = await onRun(() =>
      window.api.customFields.create({
        projectId,
        name,
        type,
        ...(choices.length ? { options: choices } : {}),
      }),
    );
    if (ok) {
      setName('');
      setOptions('');
    }
  };
  return (
    <form className="fields-new" onSubmit={(e) => void submit(e)} noValidate>
      <h3>Add a field</h3>
      <div className="fields-new__row">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={60}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Type</label>
          <select
            id={`${id}-type`}
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
          >
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        {(type === 'select' || type === 'multi_select') && (
          <div className="field">
            <label htmlFor={`${id}-options`}>Choices, separated by commas</label>
            <input
              id={`${id}-options`}
              className="input"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
            />
          </div>
        )}
        <button type="submit" className="btn">
          <Plus aria-hidden /> Add field
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
