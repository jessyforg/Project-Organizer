import type { AppLinkKind } from '@shared/app-links';
import type { AppLinkInfo, StatusCategory } from '@shared/domain';
import { formatDate, localToday } from '../../lib/format';

export const KIND_NAMES: Record<AppLinkKind, string> = {
  note: 'Note',
  task: 'Task',
  project: 'Project',
};

/** How a link to a note, task, or project shows, in the editor and the preview (ADR-0017). */
export interface LinkDisplay {
  label: string;
  missing: boolean;
  archived: boolean;
  /** Tasks: their status category (the dot's colour) and name. */
  category?: StatusCategory;
  status?: string;
  /** Tasks: the due date, formatted. */
  due?: string;
  /** The whole description, for assistive technology. */
  spoken: string;
  /** The tooltip. */
  hint: string;
}

/**
 * `info` is the item's current state (undefined while it is looked up); `saved` is the label in
 * the Markdown, shown when the item cannot be found.
 */
export function describeLink(
  kind: AppLinkKind,
  info: AppLinkInfo | undefined,
  saved: string,
  today = localToday(),
): LinkDisplay {
  const missing = info?.missing === true;
  const label = (info && !missing ? info.label : saved) || 'Untitled';
  const name = KIND_NAMES[kind];
  if (missing) {
    return {
      label,
      missing,
      archived: false,
      spoken: `${name}: ${label} (not found)`,
      hint: `${name} not found`,
    };
  }
  const due = info?.dueDate ? formatDate(info.dueDate, today) : undefined;
  const parts = [`${name}: ${label}`];
  if (info?.status) parts.push(info.status.name);
  if (due) parts.push(`due ${due}`);
  if (info?.archived) parts.push('archived');
  return {
    label,
    missing,
    archived: info?.archived === true,
    ...(info?.status ? { category: info.status.category, status: info.status.name } : {}),
    ...(due ? { due } : {}),
    spoken: parts.join(', '),
    hint: `Open “${label}”${kind === 'note' ? ' (Ctrl+click: in focus mode)' : ''}`,
  };
}
