import { Image, Smile } from 'lucide-react';
import { iconLabel } from '@shared/icons';
import { ItemIcon } from './ItemIcon';
import type { LooksTarget } from './useLooks';

/**
 * Above a project's or note's title: its icon on a tile (a button that changes it), and quiet
 * buttons to add an icon or a cover (ADR-0019). Read-only items show only the icon.
 */
export function LooksRow({
  target,
  onIcon,
  onCover,
}: {
  target: LooksTarget;
  onIcon: (target: LooksTarget) => void;
  onCover: (target: LooksTarget) => void;
}) {
  if (!target.editable && !target.icon) return null;
  const tile = target.icon && <ItemIcon value={target.icon} className="looks-row__icon" />;
  return (
    <div className="looks-row">
      {tile &&
        (target.editable ? (
          <button
            type="button"
            className="looks-row__tile"
            aria-label={`Change icon (${iconLabel(target.icon!)})`}
            title="Change icon"
            onClick={() => onIcon(target)}
          >
            {tile}
          </button>
        ) : (
          <span className="looks-row__tile">{tile}</span>
        ))}
      {target.editable && (
        <span className="looks-row__actions">
          {!target.icon && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => onIcon(target)}
            >
              <Smile aria-hidden /> Add icon
            </button>
          )}
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => onCover(target)}
          >
            <Image aria-hidden /> {target.cover ? 'Change cover' : 'Add cover'}
          </button>
        </span>
      )}
    </div>
  );
}
