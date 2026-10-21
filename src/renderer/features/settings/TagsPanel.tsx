import { useId, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { COLOR_TOKENS, type ColorToken, type Tag, type TagUsage } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, Dialog, MenuButton, Swatch, useContextMenu } from '../../components/ui';

const NO_USE: TagUsage = { tasks: 0, projects: 0, notes: 0 };

/** "2 tasks and 1 note", or "Not used". */
export function describeUsage(usage: TagUsage): string {
  const parts = (
    [
      [usage.tasks, 'task'],
      [usage.projects, 'project'],
      [usage.notes, 'note'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? '' : 's'}`);
  if (parts.length === 0) return 'Not used';
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Settings → Tags (ADR-0015): rename, recolour, or delete tags, with how often each is used. */
export function TagsPanel() {
  const tags = useQuery('lookup:tags', () => window.api.tags.list());
  const usage = useQuery('tag-usage', () => window.api.tags.usage());
  const invalidate = useInvalidate();
  const toast = useToast();
  const context = useContextMenu();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  const remove = async () => {
    if (!deleting) return;
    const result = await window.api.tags.delete({ id: deleting.id });
    setDeleting(null);
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    toast({ message: `Deleted the tag “${deleting.name}”.` });
  };

  const usageOf = (tag: Tag) => usage.data?.[tag.id] ?? NO_USE;
  const itemsFor = (tag: Tag) => [
    { label: 'Edit tag', icon: Pencil, onSelect: () => setEditing(tag) },
    {
      label: 'Delete tag',
      icon: Trash2,
      danger: true,
      separated: true,
      onSelect: () => setDeleting(tag),
    },
  ];

  const list = tags.data ?? [];
  return (
    <section className="panel settings-card" aria-labelledby="tags-heading">
      <div className="settings-card__intro">
        <h2 id="tags-heading">Tags</h2>
        <p>Rename, recolour, or delete tags. Deleting a tag keeps the items that used it.</p>
      </div>
      {tags.data && list.length === 0 && (
        <p className="muted small">No tags yet. Add them to tasks, projects, or notes.</p>
      )}
      {list.length > 0 && (
        <ul className="tag-list" aria-label="Tags">
          {list.map((tag) => (
            <li
              key={tag.id}
              className="tag-list__row"
              {...context.bind(`Actions for tag ${tag.name}`, itemsFor(tag))}
            >
              <Swatch color={tag.color} />
              <span className="tag-list__name">{tag.name}</span>
              <span className="muted small">{describeUsage(usageOf(tag))}</span>
              <MenuButton label={`Actions for tag ${tag.name}`} items={itemsFor(tag)} />
            </li>
          ))}
        </ul>
      )}
      {context.menu}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} label="Edit tag">
        {editing && <TagForm tag={editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the tag “${deleting?.name ?? ''}”?`}
        body={
          deleting && describeUsage(usageOf(deleting)) !== 'Not used'
            ? `It is removed from ${describeUsage(usageOf(deleting))}. The items are kept.`
            : 'No items use it.'
        }
        confirmLabel="Delete tag"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

function TagForm({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const id = useId();
  const invalidate = useInvalidate();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<ColorToken | null>(tag.color);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="dialog__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Enter a tag name.');
        void (async () => {
          const result = await window.api.tags.update({ id: tag.id, name, color });
          if (!result.ok) return setError(result.error.message);
          invalidate();
          onDone();
        })();
      }}
    >
      <h2>Edit tag</h2>
      <div className="field">
        <label htmlFor={`${id}-name`}>Tag name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={200}
          autoFocus
          aria-invalid={error !== null}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Colour</legend>
        <div className="swatches">
          <label title="No colour">
            <input
              type="radio"
              name={`${id}-color`}
              checked={color === null}
              onChange={() => setColor(null)}
              aria-label="No colour"
            />
            <Swatch color={null} />
          </label>
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
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save tag
        </button>
      </div>
    </form>
  );
}
