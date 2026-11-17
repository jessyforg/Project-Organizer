import type { CustomField, CustomFieldOption, CustomFieldType, CustomValue } from '@shared/domain';
import type {
  CreateCustomFieldInput,
  SetCustomValueInput,
  UpdateCustomFieldInput,
} from '@shared/schemas';
import { evenlySpacedKeys, keyAfter } from '../domain/sort-keys';
import { AppError } from '../errors';
import { recordActivity } from './activity';
import { notFound, nowIso, withUniqueName, type ServiceContext } from './context';
import { requireLiveProject } from './projects';

export const MAX_FIELDS = 30;
export const MAX_OPTIONS = 50;
export const MAX_TEXT = 1000;

const TYPE_NAME: Record<CustomFieldType, string> = {
  text: 'text',
  number: 'a number',
  date: 'a date',
  checkbox: 'a checkbox',
  select: 'a single choice',
  multi_select: 'a multiple choice',
};

interface Row {
  id: string;
  project_id: string;
  name: string;
  type: CustomFieldType;
  options_json: string;
  sort_key: number;
  value_count: number;
}

const SELECT = `
  SELECT f.id, f.project_id, f.name, f.type, f.options_json, f.sort_key,
         (SELECT count(*) FROM custom_values v JOIN tasks t ON t.id = v.task_id
          WHERE v.field_id = f.id AND t.deleted_at IS NULL) AS value_count
  FROM custom_fields f`;

function toField(row: Row): CustomField {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    options: JSON.parse(row.options_json) as CustomFieldOption[],
    sortKey: row.sort_key,
    valueCount: row.value_count,
  };
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

const isRealDate = (text: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** How a value reads, as in the activity log and for type changes (ADR-0023). */
export function valueText(
  field: Pick<CustomField, 'type' | 'options'>,
  value: CustomValue,
): string {
  const label = (id: string) => field.options.find((o) => o.id === id)?.label ?? '';
  if (field.type === 'select') return label(String(value));
  if (field.type === 'multi_select') return (value as string[]).map(label).join(', ');
  if (field.type === 'checkbox') return value === true ? 'Yes' : '';
  return String(value);
}

/**
 * Task fields a project defines (ADR-0023). Values are checked against the field's type and
 * options; a type change converts every value or changes nothing.
 */
export class CustomFieldService {
  constructor(private readonly ctx: ServiceContext) {}

  list(projectId: string): CustomField[] {
    requireLiveProject(this.ctx.db, projectId);
    const rows = this.ctx.db
      .prepare(
        `${SELECT} WHERE f.project_id = ? AND f.deleted_at IS NULL ORDER BY f.sort_key, f.id`,
      )
      .all(projectId) as Row[];
    return rows.map(toField);
  }

  get(id: string): CustomField {
    const row = this.ctx.db
      .prepare(
        `${SELECT} JOIN projects p ON p.id = f.project_id
         WHERE f.id = ? AND f.deleted_at IS NULL AND p.deleted_at IS NULL`,
      )
      .get(id) as Row | undefined;
    if (!row) throw notFound('Field');
    return toField(row);
  }

  create(input: CreateCustomFieldInput): CustomField {
    const { db } = this.ctx;
    this.requireOpenProject(input.projectId);
    const count = (
      db
        .prepare(
          'SELECT count(*) AS n FROM custom_fields WHERE project_id = ? AND deleted_at IS NULL',
        )
        .get(input.projectId) as { n: number }
    ).n;
    if (count >= MAX_FIELDS) {
      throw new AppError('VALIDATION_FAILED', `A project can have up to ${MAX_FIELDS} fields.`);
    }
    const options = this.newOptions(input.type, input.options ?? []);
    const last = db
      .prepare('SELECT max(sort_key) AS k FROM custom_fields WHERE project_id = ?')
      .get(input.projectId) as { k: number | null };
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    withUniqueName('This project already has a field with that name.', () =>
      db
        .prepare(
          `INSERT INTO custom_fields
             (id, project_id, name, name_key, type, options_json, sort_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.name.trim(),
          nameKey(input.name),
          input.type,
          JSON.stringify(options),
          keyAfter(last.k),
          now,
          now,
        ),
    );
    return this.get(id);
  }

  /**
   * Renames the field and, for choices, replaces its options: options keep their IDs, new
   * ones get IDs, and removed ones are taken out of every task's value.
   */
  update(input: UpdateCustomFieldInput): CustomField {
    const field = this.requireEditable(input.id);
    const { db } = this.ctx;
    const name = input.name?.trim() ?? field.name;
    let options = field.options;
    if (input.options !== undefined) {
      if (field.type !== 'select' && field.type !== 'multi_select') {
        throw new AppError('VALIDATION_FAILED', 'Only choice fields have options.');
      }
      const known = new Set(field.options.map((o) => o.id));
      options = input.options.map((o) => ({
        id: o.id && known.has(o.id) ? o.id : this.ctx.newId(),
        label: o.label.trim(),
      }));
      this.checkOptions(options);
    }
    const kept = new Set(options.map((o) => o.id));
    db.transaction(() => {
      withUniqueName('This project already has a field with that name.', () =>
        db
          .prepare(
            'UPDATE custom_fields SET name = ?, name_key = ?, options_json = ?, updated_at = ? WHERE id = ?',
          )
          .run(name, nameKey(name), JSON.stringify(options), nowIso(this.ctx), field.id),
      );
      for (const { task_id, value_json } of this.values(field.id)) {
        const value = JSON.parse(value_json) as CustomValue;
        if (field.type === 'select' && !kept.has(String(value)))
          this.write(task_id, field.id, null);
        if (field.type === 'multi_select') {
          const next = (value as string[]).filter((v) => kept.has(v));
          if (next.length !== (value as string[]).length) {
            this.write(task_id, field.id, next.length ? next : null);
          }
        }
      }
    })();
    return this.get(field.id);
  }

  reorder(input: { projectId: string; ids: string[] }): CustomField[] {
    const current = this.list(input.projectId).map((f) => f.id);
    if (current.length !== input.ids.length || new Set(input.ids).size !== input.ids.length) {
      throw new AppError('VALIDATION_FAILED', 'The new order must include every field once.');
    }
    const known = new Set(current);
    if (!input.ids.every((id) => known.has(id))) throw notFound('Field');
    const keys = evenlySpacedKeys(input.ids.length);
    const update = this.ctx.db.prepare('UPDATE custom_fields SET sort_key = ? WHERE id = ?');
    this.ctx.db.transaction(() => input.ids.forEach((id, i) => update.run(keys[i], id)))();
    return this.list(input.projectId);
  }

  /**
   * Changes the type when every value converts (through its text), or changes nothing and
   * names the values that block it (ADR-0023).
   */
  changeType(input: { id: string; type: CustomFieldType }): CustomField {
    const field = this.requireEditable(input.id);
    if (field.type === input.type) return field;
    const rows = this.ctx.db
      .prepare(
        `SELECT v.task_id, v.value_json, t.title FROM custom_values v JOIN tasks t ON t.id = v.task_id
         WHERE v.field_id = ? ORDER BY t.title COLLATE NOCASE`,
      )
      .all(field.id) as { task_id: string; value_json: string; title: string }[];

    // Choices keep their options (by label); new labels become new options.
    const options: CustomFieldOption[] =
      input.type === 'select' || input.type === 'multi_select'
        ? field.type === 'select' || field.type === 'multi_select'
          ? [...field.options]
          : []
        : [];
    const optionFor = (label: string) => {
      const key = label.toLocaleLowerCase();
      let option = options.find((o) => o.label.toLocaleLowerCase() === key);
      if (!option) {
        option = { id: this.ctx.newId(), label: label.slice(0, 60) };
        options.push(option);
      }
      return option.id;
    };

    const converted: { taskId: string; value: CustomValue | null }[] = [];
    const blocked: { title: string; text: string }[] = [];
    for (const row of rows) {
      const value = JSON.parse(row.value_json) as CustomValue;
      const text = valueText(field, value).trim();
      const labels =
        field.type === 'multi_select'
          ? (value as string[])
              .map((id) => field.options.find((o) => o.id === id)?.label ?? '')
              .filter(Boolean)
          : text
            ? text
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
      let next: CustomValue | null | undefined;
      switch (input.type) {
        case 'text':
          next = text ? text.slice(0, MAX_TEXT) : null;
          break;
        case 'number':
          next = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
          break;
        case 'date':
          next = isRealDate(text) ? text : undefined;
          break;
        case 'checkbox': {
          const lower = text.toLocaleLowerCase();
          next = ['yes', 'true', '1'].includes(lower)
            ? true
            : ['no', 'false', '0', ''].includes(lower)
              ? null
              : undefined;
          break;
        }
        case 'select':
          next =
            field.type === 'multi_select' && labels.length > 1
              ? undefined
              : text
                ? optionFor(field.type === 'multi_select' ? labels[0]! : text)
                : null;
          break;
        case 'multi_select':
          next = labels.length ? [...new Set(labels.map(optionFor))] : null;
          break;
      }
      if (next === undefined) blocked.push({ title: row.title, text });
      else converted.push({ taskId: row.task_id, value: next });
    }

    if (blocked.length > 0) {
      const examples = blocked
        .slice(0, 5)
        .map((b) => `“${b.text}” (${b.title})`)
        .join(', ');
      const more = blocked.length > 5 ? `, and ${blocked.length - 5} more` : '';
      throw new AppError(
        'CONFLICT',
        `${blocked.length === 1 ? '1 value cannot' : `${blocked.length} values cannot`} become ${TYPE_NAME[input.type]}: ${examples}${more}. Change or clear ${blocked.length === 1 ? 'it' : 'them'} first.`,
      );
    }
    if (options.length > MAX_OPTIONS) {
      throw new AppError(
        'CONFLICT',
        `The values would make ${options.length} choices; a field can have up to ${MAX_OPTIONS}.`,
      );
    }
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare('UPDATE custom_fields SET type = ?, options_json = ?, updated_at = ? WHERE id = ?')
        .run(input.type, JSON.stringify(options), nowIso(this.ctx), field.id);
      for (const { taskId, value } of converted) this.write(taskId, field.id, value);
    })();
    return this.get(field.id);
  }

  /** Sets or clears a task's value, after checking it fits the field (ADR-0023). */
  setValue(input: SetCustomValueInput): void {
    const { db } = this.ctx;
    const field = this.get(input.fieldId);
    const task = db
      .prepare('SELECT id, title, project_id FROM tasks WHERE id = ? AND deleted_at IS NULL')
      .get(input.taskId) as { id: string; title: string; project_id: string } | undefined;
    if (!task) throw notFound('Task');
    if (task.project_id !== field.projectId) {
      throw new AppError('VALIDATION_FAILED', 'This field belongs to another project.');
    }
    const value = this.validate(field, input.value);
    const before = db
      .prepare('SELECT value_json FROM custom_values WHERE task_id = ? AND field_id = ?')
      .get(task.id, field.id) as { value_json: string } | undefined;
    const oldText = before ? valueText(field, JSON.parse(before.value_json) as CustomValue) : '';
    const newText = value === null ? '' : valueText(field, value);
    db.transaction(() => {
      this.write(task.id, field.id, value);
      if (oldText !== newText) {
        recordActivity(this.ctx, {
          kind: 'task',
          id: task.id,
          projectId: task.project_id,
          title: task.title,
          action: 'changed',
          field: `custom:${field.name}`,
          oldValue: oldText || null,
          newValue: newText || null,
        });
      }
    })();
  }

  /** A live field in a live, unarchived project. */
  requireEditable(id: string): CustomField {
    const field = this.get(id);
    this.requireOpenProject(field.projectId);
    return field;
  }

  private requireOpenProject(projectId: string): void {
    const project = requireLiveProject(this.ctx.db, projectId);
    if (project.archived_at !== null) {
      throw new AppError('CONFLICT', 'Unarchive the project to change its fields.');
    }
  }

  private validate(field: CustomField, value: CustomValue | null): CustomValue | null {
    if (value === null) return null;
    const invalid = () =>
      new AppError('VALIDATION_FAILED', `“${field.name}” needs ${TYPE_NAME[field.type]}.`);
    switch (field.type) {
      case 'text': {
        if (typeof value !== 'string') throw invalid();
        const text = value.trim();
        if (text.length > MAX_TEXT) {
          throw new AppError(
            'VALIDATION_FAILED',
            `Text fields can be up to ${MAX_TEXT} characters.`,
          );
        }
        return text || null;
      }
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
        return value;
      case 'date':
        if (typeof value !== 'string' || !isRealDate(value)) throw invalid();
        return value;
      case 'checkbox':
        if (typeof value !== 'boolean') throw invalid();
        return value || null;
      case 'select':
        if (typeof value !== 'string' || !field.options.some((o) => o.id === value))
          throw invalid();
        return value;
      case 'multi_select': {
        if (!Array.isArray(value)) throw invalid();
        const ids = [...new Set(value)];
        if (!ids.every((id) => field.options.some((o) => o.id === id))) throw invalid();
        // Kept in the options' order, so equal choices read the same.
        const ordered = field.options.filter((o) => ids.includes(o.id)).map((o) => o.id);
        return ordered.length ? ordered : null;
      }
    }
  }

  private write(taskId: string, fieldId: string, value: CustomValue | null): void {
    if (value === null) {
      this.ctx.db
        .prepare('DELETE FROM custom_values WHERE task_id = ? AND field_id = ?')
        .run(taskId, fieldId);
      return;
    }
    this.ctx.db
      .prepare(
        `INSERT INTO custom_values (task_id, field_id, value_json) VALUES (?, ?, ?)
         ON CONFLICT (task_id, field_id) DO UPDATE SET value_json = excluded.value_json`,
      )
      .run(taskId, fieldId, JSON.stringify(value));
  }

  private values(fieldId: string): { task_id: string; value_json: string }[] {
    return this.ctx.db
      .prepare('SELECT task_id, value_json FROM custom_values WHERE field_id = ?')
      .all(fieldId) as { task_id: string; value_json: string }[];
  }

  private newOptions(type: CustomFieldType, labels: string[]): CustomFieldOption[] {
    if (type !== 'select' && type !== 'multi_select') return [];
    const options = labels.map((label) => ({ id: this.ctx.newId(), label: label.trim() }));
    this.checkOptions(options);
    return options;
  }

  private checkOptions(options: CustomFieldOption[]): void {
    if (options.length > MAX_OPTIONS) {
      throw new AppError('VALIDATION_FAILED', `A field can have up to ${MAX_OPTIONS} choices.`);
    }
    const keys = options.map((o) => o.label.toLocaleLowerCase());
    if (keys.some((k) => !k) || new Set(keys).size !== keys.length) {
      throw new AppError('VALIDATION_FAILED', 'Each choice needs a different, non-empty name.');
    }
  }
}
