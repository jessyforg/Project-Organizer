import { useRef, useState, type KeyboardEvent } from 'react';
import { ImageUp, X } from 'lucide-react';
import { COVER_LABEL, COVER_PRESETS, coverValue, parseCover } from '@shared/covers';
import { ICONS } from '@shared/icons';
import { Dialog } from '../../components/ui';
import { CoverSwatch } from './Cover';
import { ItemIcon } from './ItemIcon';

/**
 * A grid of buttons that is one Tab stop: arrow keys move by one or by a row, Home and End go
 * to the ends, and focus starts on the chosen value (or the first).
 */
function useGridFocus(count: number, columns: number, start: number) {
  const [focusIndex, setFocusIndex] = useState(Math.max(0, start));
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      ArrowDown: focusIndex + columns,
      ArrowUp: focusIndex - columns,
      Home: 0,
      End: count - 1,
    };
    const target = moves[event.key];
    if (target === undefined || target < 0 || target >= count) return;
    event.preventDefault();
    setFocusIndex(target);
    items.current[target]?.focus();
  };
  const itemProps = (index: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      items.current[index] = el;
    },
    tabIndex: index === focusIndex ? 0 : -1,
    onFocus: () => setFocusIndex(index),
  });
  return { onKeyDown, itemProps };
}

export interface PickerTarget {
  title: string;
  current: string | null;
}

/** Choose one of the built-in icons, or remove it (ADR-0019). */
export function IconPicker({
  target,
  onChoose,
  onClose,
}: {
  target: PickerTarget | null;
  onChoose: (value: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onClose={onClose} label="Choose an icon" wide>
      {target && <IconGrid target={target} onChoose={onChoose} onClose={onClose} />}
    </Dialog>
  );
}

const ICON_COLUMNS = 10;

function IconGrid({
  target,
  onChoose,
  onClose,
}: {
  target: PickerTarget;
  onChoose: (value: string | null) => void;
  onClose: () => void;
}) {
  const grid = useGridFocus(
    ICONS.length,
    ICON_COLUMNS,
    ICONS.findIndex((icon) => icon.value === target.current),
  );
  return (
    <div className="dialog__form">
      <h2>Icon for “{target.title}”</h2>
      <p className="dialog__body">Use the arrow keys to move between icons.</p>
      <div
        className="look-grid look-grid--icons"
        role="group"
        aria-label="Icons"
        onKeyDown={grid.onKeyDown}
      >
        {ICONS.map((icon, index) => (
          <button
            key={icon.value}
            type="button"
            className="look-grid__choice"
            aria-label={icon.label}
            aria-pressed={icon.value === target.current}
            title={icon.label}
            onClick={() => onChoose(icon.value)}
            {...grid.itemProps(index)}
          >
            <ItemIcon value={icon.value} />
          </button>
        ))}
      </div>
      <div className="dialog__actions">
        {target.current && (
          <button
            type="button"
            className="btn dialog__actions-start"
            onClick={() => onChoose(null)}
          >
            <X aria-hidden /> Remove icon
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Choose a cover preset or an image, or remove the cover (ADR-0019). */
export function CoverPicker({
  target,
  onChoose,
  onUpload,
  onClose,
}: {
  target: PickerTarget | null;
  onChoose: (value: string | null) => void;
  /** Stores the image and makes it the cover; resolves an error message, or null. */
  onUpload: (file: File) => Promise<string | null>;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onClose={onClose} label="Choose a cover" wide>
      {target && (
        <CoverGrid target={target} onChoose={onChoose} onUpload={onUpload} onClose={onClose} />
      )}
    </Dialog>
  );
}

const COVER_COLUMNS = 8;

function CoverGrid({
  target,
  onChoose,
  onUpload,
  onClose,
}: {
  target: PickerTarget;
  onChoose: (value: string | null) => void;
  onUpload: (file: File) => Promise<string | null>;
  onClose: () => void;
}) {
  const current = parseCover(target.current);
  const grid = useGridFocus(
    COVER_PRESETS.length,
    COVER_COLUMNS,
    current?.kind === 'preset' ? COVER_PRESETS.indexOf(current.preset) : 0,
  );
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const failed = await onUpload(file);
    setBusy(false);
    if (failed) setError(failed);
  };

  return (
    <div className="dialog__form">
      <h2>Cover for “{target.title}”</h2>
      <div
        className="look-grid look-grid--covers"
        role="group"
        aria-label="Colours and gradients"
        onKeyDown={grid.onKeyDown}
      >
        {COVER_PRESETS.map((preset, index) => (
          <button
            key={preset}
            type="button"
            className="look-grid__choice look-grid__choice--cover"
            aria-label={COVER_LABEL[preset]}
            aria-pressed={current?.kind === 'preset' && current.preset === preset}
            title={COVER_LABEL[preset]}
            onClick={() => onChoose(coverValue({ kind: 'preset', preset }))}
            {...grid.itemProps(index)}
          >
            <CoverSwatch preset={preset} />
          </button>
        ))}
      </div>
      <div className="look-upload">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <ImageUp aria-hidden /> {busy ? 'Adding the image…' : 'Upload an image…'}
        </button>
        <span className="muted small">PNG, JPEG, GIF, or WebP, up to 20 MB.</span>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          data-testid="cover-image-input"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog__actions">
        {target.current && (
          <button
            type="button"
            className="btn dialog__actions-start"
            onClick={() => onChoose(null)}
          >
            <X aria-hidden /> Remove cover
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
