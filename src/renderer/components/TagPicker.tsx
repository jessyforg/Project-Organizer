import { useId, useState } from 'react';
import { useLookups } from '../features/tasks/useLookups';
import { useToast } from '../app/toasts';

/** Toggle chips for every tag, plus a field that creates a tag and selects it. */
export function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tagIds: string[]) => Promise<void>;
}) {
  const id = useId();
  const { tagList } = useLookups();
  const toast = useToast();
  const [newTag, setNewTag] = useState('');

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const result = await window.api.tags.create({ name });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    setNewTag('');
    await onChange([...selected, result.data.id]);
  };

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        Tags
      </span>
      <div className="chips" role="group" aria-labelledby={`${id}-label`}>
        {tagList.map((tag) => {
          const on = selected.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className="chip"
              aria-pressed={on}
              onClick={() =>
                void onChange(on ? selected.filter((t) => t !== tag.id) : [...selected, tag.id])
              }
            >
              {tag.name}
            </button>
          );
        })}
      </div>
      <input
        className="input"
        value={newTag}
        aria-label="New tag name"
        placeholder="New tag, then Enter"
        maxLength={200}
        onChange={(e) => setNewTag(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void createTag();
          }
        }}
      />
    </div>
  );
}
