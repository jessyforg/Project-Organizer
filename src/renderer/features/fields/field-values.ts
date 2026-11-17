import type { CustomField, CustomValue } from '@shared/domain';
import { formatDate } from '../../lib/format';

export const TYPE_LABEL: Record<CustomField['type'], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  checkbox: 'Checkbox',
  select: 'Single choice',
  multi_select: 'Multiple choice',
};

const label = (field: CustomField, id: string) =>
  field.options.find((o) => o.id === id)?.label ?? '';

/** How a value reads in the table and lists; '' for no value (ADR-0023). */
export function fieldText(
  field: CustomField,
  value: CustomValue | undefined,
  today: string,
): string {
  if (value === undefined) return '';
  switch (field.type) {
    case 'date':
      return formatDate(String(value), today);
    case 'checkbox':
      return value === true ? 'Yes' : '';
    case 'select':
      return label(field, String(value));
    case 'multi_select':
      return (value as string[]).map((id) => label(field, id)).join(', ');
    default:
      return String(value);
  }
}

/** A value in the field's natural order, or null for none. */
export function fieldSortValue(
  field: CustomField,
  value: CustomValue | undefined,
): string | number | null {
  if (value === undefined) return null;
  switch (field.type) {
    case 'number':
      return value as number;
    case 'checkbox':
      return 0;
    case 'select':
      return field.options.findIndex((o) => o.id === value);
    case 'multi_select':
      return field.options.findIndex((o) => o.id === (value as string[])[0]);
    case 'date':
      return String(value);
    default:
      return String(value).toLocaleLowerCase();
  }
}

/** The text an editor starts with: the value, 'yes' for a ticked checkbox, an option ID. */
export function fieldEditValue(field: CustomField, value: CustomValue | undefined): string {
  if (value === undefined) return '';
  if (field.type === 'checkbox') return value === true ? 'yes' : '';
  return String(value);
}

/** An editor's text as a value to save; undefined when it is not valid for the field. */
export function parseFieldEdit(field: CustomField, text: string): CustomValue | null | undefined {
  const trimmed = text.trim();
  switch (field.type) {
    case 'number': {
      if (!trimmed) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'checkbox':
      return trimmed === 'yes';
    case 'multi_select':
      return undefined;
    default:
      return trimmed || null;
  }
}

/**
 * The table's field filter (ADR-0023): text contains the words; choices and checkboxes match
 * exactly; numbers and dates match equal values.
 */
export function fieldMatches(
  field: CustomField,
  value: CustomValue | undefined,
  wanted: string,
): boolean {
  if (!wanted) return true;
  switch (field.type) {
    case 'text':
      return String(value ?? '')
        .toLocaleLowerCase()
        .includes(wanted.toLocaleLowerCase());
    case 'checkbox':
      return wanted === 'yes' ? value === true : value === undefined;
    case 'select':
      return value === wanted;
    case 'multi_select':
      return Array.isArray(value) && value.includes(wanted);
    case 'number':
      return value !== undefined && Number(value) === Number(wanted);
    default:
      return value === wanted;
  }
}
