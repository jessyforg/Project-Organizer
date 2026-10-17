import { useId, useState, type FormEvent } from 'react';
import { COLOR_TOKENS, type ColorToken, type Project, type ProjectKind } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { Dialog, Swatch } from '../../components/ui';
import { useLookups } from '../tasks/useLookups';

const NEW_FOLDER = '__new__';

/** Create or edit a project's details. */
export function ProjectDialog({
  open,
  project,
  onClose,
}: {
  open: boolean;
  project?: Project;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={project ? 'Edit project' : 'New project'}>
      <ProjectForm project={project} onDone={onClose} />
    </Dialog>
  );
}

function ProjectForm({ project, onDone }: { project: Project | undefined; onDone: () => void }) {
  const id = useId();
  const invalidate = useInvalidate();
  const { navigate } = useNavigation();
  const { tagList } = useLookups();
  const folders = useQuery('folders', () => window.api.folders.list());
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? 'general');
  const [color, setColor] = useState<ColorToken | null>(project?.color ?? 'blue');
  const [folderId, setFolderId] = useState(project?.folderId ?? '');
  const [newFolder, setNewFolder] = useState('');
  const [startDate, setStartDate] = useState(project?.startDate ?? '');
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? '');
  const [tagIds, setTagIds] = useState<string[]>(project?.tagIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Enter a project name.');
    if (startDate && targetDate && startDate > targetDate) {
      return setError('The start date must be on or before the target date.');
    }
    setBusy(true);
    setError(null);

    let folder: string | null = folderId || null;
    if (folderId === NEW_FOLDER) {
      if (!newFolder.trim()) {
        setBusy(false);
        return setError('Enter a name for the new folder.');
      }
      const created = await window.api.folders.create({ name: newFolder });
      if (!created.ok) {
        setBusy(false);
        return setError(created.error.message);
      }
      folder = created.data.id;
    }

    const fields = {
      name,
      description: description.trim() ? description : null,
      kind,
      color,
      folderId: folder,
      startDate: startDate || null,
      targetDate: targetDate || null,
    };
    const result = project
      ? await window.api.projects.update({ id: project.id, ...fields })
      : await window.api.projects.create({ ...fields, tagIds });
    if (result.ok && project) {
      const tagged = await window.api.tags.setProjectTags({ projectId: project.id, tagIds });
      if (!tagged.ok) {
        setBusy(false);
        return setError(tagged.error.message);
      }
    }
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    invalidate();
    onDone();
    if (!project) navigate({ name: 'project', id: result.data.id });
  };

  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>{project ? 'Edit project' : 'New project'}</h2>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={200}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          className="textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="task-details__grid">
        <div className="field">
          <label htmlFor={`${id}-kind`}>Type</label>
          <select
            id={`${id}-kind`}
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
          >
            <option value="general">General</option>
            <option value="software">Software development</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-folder`}>Folder</label>
          <select
            id={`${id}-folder`}
            className="select"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">No folder</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value={NEW_FOLDER}>New folder…</option>
          </select>
        </div>
        {folderId === NEW_FOLDER && (
          <div className="field">
            <label htmlFor={`${id}-new-folder`}>New folder name</label>
            <input
              id={`${id}-new-folder`}
              className="input"
              value={newFolder}
              maxLength={200}
              onChange={(e) => setNewFolder(e.target.value)}
            />
          </div>
        )}
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
        <div className="field">
          <label htmlFor={`${id}-target`}>Target date</label>
          <input
            id={`${id}-target`}
            className="input"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Colour</legend>
        <div className="swatches">
          {COLOR_TOKENS.map((token) => (
            <label key={token} title={token}>
              <input
                type="radio"
                name={`${id}-color`}
                value={token}
                checked={color === token}
                onChange={() => setColor(token)}
                aria-label={token}
              />
              <Swatch color={token} />
            </label>
          ))}
        </div>
      </fieldset>
      {tagList.length > 0 && (
        <div className="field">
          <span className="field__label">Tags</span>
          <div className="chips" role="group" aria-label="Tags">
            {tagList.map((tag) => {
              const on = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() =>
                    setTagIds(on ? tagIds.filter((t) => t !== tag.id) : [...tagIds, tag.id])
                  }
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {project ? 'Save changes' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
