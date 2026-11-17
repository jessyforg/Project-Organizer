import { useId, useRef, useState, type FormEvent } from 'react';
import { Download, FileUp, Trash2 } from 'lucide-react';
import { MAX_TEMPLATE_TEXT, type TemplateSummary } from '@shared/templates';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { localToday, plural } from '../../lib/format';

/** "3 statuses · 12 tasks · 2 milestones …" for a template. */
function describeCounts(t: TemplateSummary): string {
  const c = t.counts;
  return [
    plural(c.tasks, 'task'),
    plural(c.milestones, 'milestone'),
    plural(c.fields, 'field'),
    plural(c.notes, 'note'),
    plural(c.statuses, 'status', 'statuses'),
  ].join(' · ');
}

/**
 * Choose a template, see what it contains, then name the project and pick a start date
 * (ADR-0024). Creating is all or nothing; the template is never changed.
 */
export function NewFromTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="New project from a template" wide>
      {open && <TemplatePicker onClose={onClose} />}
    </Dialog>
  );
}

function TemplatePicker({ onClose }: { onClose: () => void }) {
  const id = useId();
  const templates = useQuery('templates', () => window.api.templates.list());
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? templates.data?.[0]?.id ?? null;
  const details = useQuery(`template:${selected ?? ''}`, () =>
    selected
      ? window.api.templates.get({ id: selected })
      : Promise.resolve({ ok: true as const, data: null }),
  );
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(localToday());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const { navigate } = useNavigation();
  const toast = useToast();
  const template = details.data && details.data.id === selected ? details.data : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!template) return;
    if (!name.trim()) return setError('Enter a name for the project.');
    setBusy(true);
    const result = await window.api.templates.createProject({
      templateId: template.id,
      name,
      ...(template.hasDates ? { startDate } : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    invalidate();
    onClose();
    navigate({ name: 'project', id: result.data.id });
    toast({ message: `Created “${result.data.name}” from “${template.name}”.` });
  };

  const content = template?.content;
  const shownTasks = content?.tasks.slice(0, 30) ?? [];
  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>New project from a template</h2>
      <div className="template-picker">
        <div role="radiogroup" aria-label="Templates" className="template-picker__list">
          {(templates.data ?? []).map((t) => (
            <label key={t.id} className="template-choice">
              <input
                type="radio"
                name={`${id}-template`}
                checked={t.id === selected}
                onChange={() => {
                  setChosen(t.id);
                  setError(null);
                }}
              />
              <span className="template-choice__text">
                <span className="template-choice__name">
                  {t.name}
                  {t.builtIn && <span className="label">Built in</span>}
                </span>
                {t.description && (
                  <span className="template-choice__description">{t.description}</span>
                )}
                <span className="template-choice__counts">{describeCounts(t)}</span>
              </span>
            </label>
          ))}
        </div>
        {/* It scrolls, so it is a Tab stop for keyboard scrolling (WCAG 2.1.1). */}
        <section className="template-preview" aria-label="Preview" tabIndex={0}>
          {!content && <p className="muted">Loading the preview…</p>}
          {content && (
            <>
              <h3>Workflow</h3>
              <p>{content.statuses.map((s) => s.name).join(' → ')}</p>
              {content.milestones.length > 0 && (
                <>
                  <h3>Milestones</h3>
                  <ul>
                    {content.milestones.map((m) => (
                      <li key={m.key}>
                        {m.name}
                        {m.target !== null && <span className="muted"> · day {m.target}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {content.fields.length > 0 && (
                <>
                  <h3>Fields</h3>
                  <p>{content.fields.map((f) => f.name).join(', ')}</p>
                </>
              )}
              {content.tags.length > 0 && (
                <>
                  <h3>Tags</h3>
                  <p>{content.tags.map((t) => t.name).join(', ')}</p>
                </>
              )}
              <h3>Tasks</h3>
              <ul>
                {shownTasks.map((t, i) => (
                  <li key={i}>
                    {t.title}
                    {t.subtasks.length > 0 && (
                      <span className="muted"> · {plural(t.subtasks.length, 'subtask')}</span>
                    )}
                  </li>
                ))}
              </ul>
              {content.tasks.length > shownTasks.length && (
                <p className="muted small">And {content.tasks.length - shownTasks.length} more.</p>
              )}
              {content.notes.length > 0 && (
                <>
                  <h3>Notes</h3>
                  <p>{content.notes.map((n) => n.title).join(', ')}</p>
                </>
              )}
            </>
          )}
        </section>
      </div>
      <div className="template-picker__form">
        <div className="field">
          <label htmlFor={`${id}-name`}>Project name</label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={200}
            aria-invalid={error !== null}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </div>
        {template?.hasDates && (
          <div className="field">
            <label htmlFor={`${id}-start`}>Start date</label>
            <input
              id={`${id}-start`}
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy || !template}>
          Create project
        </button>
      </div>
    </form>
  );
}

/** Rename, export, delete, and import templates (ADR-0024). */
export function TemplatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="Templates" wide>
      {open && <TemplateManager onClose={onClose} />}
    </Dialog>
  );
}

function TemplateManager({ onClose }: { onClose: () => void }) {
  const templates = useQuery('templates', () => window.api.templates.list());
  const invalidate = useInvalidate();
  const picker = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);

  const done = (result: { ok: boolean; error?: { message: string } }, success: string) => {
    invalidate();
    setMessage(
      result.ok
        ? { text: success, error: false }
        : { text: result.error?.message ?? '', error: true },
    );
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_TEMPLATE_TEXT) {
      return setMessage({ text: 'The file is too large to be a template.', error: true });
    }
    const result = await window.api.templates.import({ text: await file.text() });
    done(result, result.ok ? `Imported “${result.data.name}”.` : '');
  };

  return (
    <div className="dialog__form">
      <h2>Templates</h2>
      <p className="dialog__body">
        Built-in templates cannot be changed. Save a project as a template from its ⋯ menu.
      </p>
      {message && (
        <p
          className={message.error ? 'field__error' : 'notice'}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <ul className="templates-list" aria-label="Templates">
        {(templates.data ?? []).map((t) => (
          <TemplateRow
            key={`${t.id}:${t.name}`}
            template={t}
            onRename={async (name) =>
              done(await window.api.templates.rename({ id: t.id, name }), `Renamed to “${name}”.`)
            }
            onExport={async () => {
              const result = await window.api.templates.export({ id: t.id });
              if (result.ok && !result.data.saved) return;
              done(
                result,
                result.ok ? `Saved “${result.data.saved ? result.data.fileName : ''}”.` : '',
              );
            }}
            onDelete={() => setDeleting(t)}
          />
        ))}
      </ul>
      <div className="dialog__actions">
        <button
          type="button"
          className="btn dialog__actions-start"
          onClick={() => picker.current?.click()}
        >
          <FileUp aria-hidden /> Import a template…
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="template-import-input"
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the template “${deleting?.name ?? ''}”?`}
        body="Projects made from it are not affected. This cannot be undone; export it first to keep a copy."
        confirmLabel="Delete template"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) {
            void window.api.templates
              .delete({ id: target.id })
              .then((r) => done(r, `Deleted “${target.name}”.`));
          }
        }}
      />
    </div>
  );
}

function TemplateRow({
  template,
  onRename,
  onExport,
  onDelete,
}: {
  template: TemplateSummary;
  onRename: (name: string) => Promise<void>;
  onExport: () => Promise<void>;
  onDelete: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(template.name);
  return (
    <li className="templates-list__item">
      {template.builtIn ? (
        <span className="templates-list__name">
          {template.name} <span className="label">Built in</span>
        </span>
      ) : (
        <>
          <label className="visually-hidden" htmlFor={`${id}-name`}>
            Name of template {template.name}
          </label>
          <input
            id={`${id}-name`}
            className="input"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== template.name) void onRename(name);
              else setName(template.name);
            }}
          />
        </>
      )}
      <span className="muted small">{describeCounts(template)}</span>
      <span className="templates-list__actions">
        <button
          type="button"
          className="btn btn--quiet btn--small"
          aria-label={`Export ${template.name}`}
          onClick={() => void onExport()}
        >
          <Download aria-hidden /> Export
        </button>
        {!template.builtIn && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            aria-label={`Delete ${template.name}`}
            onClick={onDelete}
          >
            <Trash2 aria-hidden /> Delete
          </button>
        )}
      </span>
    </li>
  );
}

/** Save a project's structure as a template, optionally keeping dates (ADR-0024). */
export function SaveTemplateDialog({
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
    <Dialog open={open} onClose={onClose} label="Save as template">
      {open && (
        <SaveTemplateForm projectId={projectId} projectName={projectName} onClose={onClose} />
      )}
    </Dialog>
  );
}

function SaveTemplateForm({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState('');
  const [keepDates, setKeepDates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const toast = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Enter a name for the template.');
    setBusy(true);
    const result = await window.api.templates.saveFromProject({
      projectId,
      name,
      description: description.trim() || null,
      keepDates,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    invalidate();
    onClose();
    toast({ message: `Saved the template “${result.data.name}”.` });
  };
  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Save “{projectName}” as a template</h2>
      <p className="dialog__body">
        The template keeps the workflow, tags, milestones, fields, tasks with their subtasks, and
        notes. Every task starts as not done.
      </p>
      <div className="field">
        <label htmlFor={`${id}-name`}>Template name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={100}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`${id}-error`} className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          className="textarea"
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={keepDates}
          onChange={(e) => setKeepDates(e.target.checked)}
        />
        Keep dates, counted from the project&rsquo;s start date
      </label>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Save template
        </button>
      </div>
    </form>
  );
}
