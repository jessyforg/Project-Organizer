import type { CustomValue, Project } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import {
  MAX_TEMPLATE_TEXT,
  TEMPLATE_FORMAT,
  templateContentSchema,
  templateFileSchema,
  type TemplateContent,
  type TemplateDetails,
  type TemplateSummary,
  type TemplateTask,
} from '@shared/templates';
import type { z } from 'zod';
import { addDays } from '../domain/dates';
import { AppError } from '../errors';
import { BUILT_IN_TEMPLATES } from '../templates/builtin';
import { notFound, nowIso, today, withUniqueName, type ServiceContext } from './context';
import { CustomFieldService } from './custom-fields';
import { MilestoneService } from './milestones';
import { NoteService } from './notes';
import { ProjectService } from './projects';
import { TagService } from './tags';
import { TaskService } from './tasks';

interface Row {
  id: string;
  name: string;
  description: string | null;
  content_json: string;
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(day(to) - day(from));
}

/** The first problem zod found, phrased for people. */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The template is not valid.';
  if (issue.code === 'custom') return issue.message;
  if (issue.code === 'too_big' && issue.path.includes('tasks')) {
    return 'The template has too many tasks.';
  }
  return `The template is not valid (${issue.path.join('.') || 'content'}: ${issue.message}).`;
}

function summarize(
  id: string,
  name: string,
  description: string | null,
  builtIn: boolean,
  content: TemplateContent,
): TemplateDetails {
  const tasks = content.tasks.flatMap((t) => [t, ...t.subtasks]);
  return {
    id,
    name,
    description,
    builtIn,
    counts: {
      statuses: content.statuses.length,
      tasks: tasks.length,
      milestones: content.milestones.length,
      fields: content.fields.length,
      notes: content.notes.length,
    },
    hasDates:
      content.milestones.some((m) => m.target !== null) ||
      tasks.some((t) => t.start !== null || t.due !== null),
    content,
  };
}

/** A template without its content, for lists. */
function toSummary(t: TemplateDetails): TemplateSummary {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    builtIn: t.builtIn,
    counts: t.counts,
    hasDates: t.hasDates,
  };
}

/**
 * Project templates (ADR-0024): three built in, plus saved and imported ones. Creating a
 * project from one is a single transaction through the usual services; the template is only
 * read.
 */
export class TemplateService {
  constructor(private readonly ctx: ServiceContext) {}

  list(): TemplateSummary[] {
    const stored = this.ctx.db
      .prepare('SELECT id, name, description, content_json FROM templates ORDER BY name_key')
      .all() as Row[];
    return [
      ...BUILT_IN_TEMPLATES.map((t) => summarize(t.id, t.name, t.description, true, t.content)),
      ...stored.map((row) => this.fromRow(row)),
    ].map(toSummary);
  }

  get(id: string): TemplateDetails {
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
    if (builtIn) {
      return summarize(builtIn.id, builtIn.name, builtIn.description, true, builtIn.content);
    }
    const row = this.ctx.db
      .prepare('SELECT id, name, description, content_json FROM templates WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) throw notFound('Template');
    return this.fromRow(row);
  }

  /**
   * A template of the project's structure (ADR-0024): statuses, tags, milestones, fields,
   * tasks with subtasks, and notes, without completion state. With `keepDates`, dates become
   * days from the project's start (or its earliest date).
   */
  saveFromProject(input: {
    projectId: string;
    name: string;
    description?: string | null | undefined;
    keepDates: boolean;
  }): TemplateSummary {
    const content = this.contentOf(input.projectId, input.keepDates);
    return this.store(input.name, input.description ?? null, content);
  }

  rename(input: { id: string; name: string }): TemplateSummary {
    this.requireStored(input.id);
    withUniqueName('A template with that name exists already.', () =>
      this.ctx.db
        .prepare('UPDATE templates SET name = ?, name_key = ?, updated_at = ? WHERE id = ?')
        .run(input.name.trim(), nameKey(input.name), nowIso(this.ctx), input.id),
    );
    return this.get(input.id);
  }

  delete(id: string): void {
    this.requireStored(id);
    this.ctx.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  }

  /** The file an export writes. */
  exportDocument(id: string): z.infer<typeof templateFileSchema> {
    const template = this.get(id);
    return {
      format: TEMPLATE_FORMAT,
      version: 1,
      name: template.name,
      description: template.description,
      content: template.content,
    };
  }

  /** Stores an exported template file's text after checking it; a taken name gets " (2)". */
  import(text: string): TemplateSummary {
    if (text.length > MAX_TEMPLATE_TEXT) {
      throw new AppError('VALIDATION_FAILED', 'The file is too large to be a template.');
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AppError('VALIDATION_FAILED', 'This is not a ProjectForge template.');
    }
    if (
      typeof data !== 'object' ||
      data === null ||
      (data as { format?: unknown }).format !== TEMPLATE_FORMAT
    ) {
      throw new AppError('VALIDATION_FAILED', 'This is not a ProjectForge template.');
    }
    const parsed = templateFileSchema.safeParse(data);
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', firstIssue(parsed.error));
    const taken = new Set(
      (this.ctx.db.prepare('SELECT name_key FROM templates').all() as { name_key: string }[]).map(
        (r) => r.name_key,
      ),
    );
    let name = parsed.data.name;
    for (let n = 2; taken.has(nameKey(name)); n += 1) name = `${parsed.data.name} (${n})`;
    return this.store(name, parsed.data.description, parsed.data.content);
  }

  /**
   * A new project built from the template, all or nothing (ADR-0024). Day offsets count from
   * `startDate` (today when not given).
   */
  createProject(input: {
    templateId: string;
    name: string;
    startDate?: string | null | undefined;
    folderId?: string | null | undefined;
  }): Project {
    const template = this.get(input.templateId);
    const content = template.content;
    const start = input.startDate ?? today(this.ctx);
    const date = (offset: number | null) => (offset === null ? null : addDays(start, offset));
    const { db } = this.ctx;
    const projects = new ProjectService(this.ctx);
    const tasks = new TaskService(this.ctx);
    const milestones = new MilestoneService(this.ctx);
    const fields = new CustomFieldService(this.ctx);
    const notes = new NoteService(this.ctx);
    const tags = new TagService(this.ctx);

    return db.transaction(() => {
      const project = projects.create({
        name: input.name,
        kind: content.project.kind,
        color: content.project.color,
        description: content.project.description,
        ...(template.hasDates ? { startDate: start } : {}),
        ...(input.folderId ? { folderId: input.folderId } : {}),
      });

      // The template's workflow replaces the default one.
      db.prepare('DELETE FROM project_statuses WHERE project_id = ?').run(project.id);
      const now = nowIso(this.ctx);
      const insertStatus = db.prepare(
        `INSERT INTO project_statuses
           (id, project_id, name, name_key, category, sort_key, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const statusIds = content.statuses.map((s, i) => {
        const id = this.ctx.newId();
        insertStatus.run(
          id,
          project.id,
          s.name,
          nameKey(s.name),
          s.category,
          (i + 1) * 1024,
          s.isDefault ? 1 : 0,
          now,
          now,
        );
        return id;
      });

      // Tags are matched by name, or created.
      const existing = new Map(tags.list().map((t) => [nameKey(t.name), t.id]));
      const tagId = (name: string) => {
        const key = nameKey(name);
        let id = existing.get(key);
        if (!id) {
          const color = content.tags.find((t) => nameKey(t.name) === key)?.color ?? null;
          id = tags.create({ name, color }).id;
          existing.set(key, id);
        }
        return id;
      };

      const milestoneIds = new Map(
        content.milestones.map((m) => [
          m.key,
          milestones.create({
            projectId: project.id,
            name: m.name,
            description: m.description,
            targetDate: date(m.target),
          }).id,
        ]),
      );

      const created = new Map(
        content.fields.map((f) => [
          f.key,
          fields.create({ projectId: project.id, name: f.name, type: f.type, options: f.options }),
        ]),
      );
      const setFields = (taskId: string, values: TemplateTask['fields']) => {
        for (const [key, raw] of Object.entries(values)) {
          const field = created.get(key);
          if (!field) continue;
          const option = (label: string) => field.options.find((o) => o.label === label)?.id;
          const value: CustomValue | undefined =
            field.type === 'select'
              ? option(String(raw))
              : field.type === 'multi_select'
                ? (Array.isArray(raw) ? raw : [String(raw)])
                    .map(option)
                    .filter((id): id is string => !!id)
                : raw;
          if (value !== undefined) fields.setValue({ taskId, fieldId: field.id, value });
        }
      };

      const addTask = (t: Omit<TemplateTask, 'subtasks'>, parentTaskId?: string) => {
        const task = tasks.create({
          title: t.title,
          ...(parentTaskId ? { parentTaskId } : { projectId: project.id }),
          description: t.description,
          priority: t.priority,
          ...(t.status !== null ? { statusId: statusIds[t.status] } : {}),
          startDate: date(t.start),
          dueDate: date(t.due),
          tagIds: t.tags.map(tagId),
          ...(!parentTaskId && t.milestone !== null
            ? { milestoneId: milestoneIds.get(t.milestone) ?? null }
            : {}),
        });
        setFields(task.id, t.fields);
        return task;
      };
      for (const t of content.tasks) {
        const parent = addTask(t);
        for (const s of t.subtasks) addTask(s, parent.id);
      }

      for (const n of content.notes)
        notes.create({ projectId: project.id, title: n.title, body: n.body });
      return projects.get(project.id);
    })();
  }

  private contentOf(projectId: string, keepDates: boolean): TemplateContent {
    const project = new ProjectService(this.ctx).get(projectId);
    const statuses = this.ctx.db
      .prepare(
        'SELECT name, category, is_default FROM project_statuses WHERE project_id = ? ORDER BY sort_key',
      )
      .all(projectId) as { name: string; category: string; is_default: number }[];
    const allTasks = new TaskService(this.ctx).list({
      projectId,
      includeArchived: true,
      sort: 'manual',
      limit: LIMITS.listPageSize,
    });
    const milestones = new MilestoneService(this.ctx).list(projectId);
    const fields = new CustomFieldService(this.ctx).list(projectId);
    const tagsById = new Map(new TagService(this.ctx).list().map((t) => [t.id, t]));
    const noteService = new NoteService(this.ctx);
    const notes = noteService
      .list({ projectId, limit: LIMITS.listPageSize })
      .map((n) => noteService.get(n.id));

    // Dates become days from the start date, or from the project's earliest date.
    const dates = [
      ...allTasks.flatMap((t) => [t.startDate, t.dueDate]),
      ...milestones.map((m) => m.targetDate),
    ].filter((d): d is string => d !== null);
    const base = project.startDate ?? [...dates].sort()[0] ?? null;
    const offset = (d: string | null) =>
      keepDates && d !== null && base !== null ? daysBetween(base, d) : null;

    const milestoneKey = new Map(milestones.map((m, i) => [m.id, `m${i + 1}`]));
    const fieldKey = new Map(fields.map((f, i) => [f.id, `f${i + 1}`]));
    const usedTags = new Set<string>();
    const toTask = (t: (typeof allTasks)[number]): Omit<TemplateTask, 'subtasks'> => {
      const names = t.tagIds.map((id) => tagsById.get(id)?.name).filter((n): n is string => !!n);
      names.forEach((n) => usedTags.add(n));
      const values: TemplateTask['fields'] = {};
      for (const field of fields) {
        const value = t.customValues[field.id];
        if (value === undefined) continue;
        const label = (id: string) => field.options.find((o) => o.id === id)?.label ?? '';
        values[fieldKey.get(field.id)!] =
          field.type === 'select'
            ? label(String(value))
            : field.type === 'multi_select'
              ? (value as string[]).map(label).filter(Boolean)
              : value;
      }
      return {
        title: t.title,
        description: t.description,
        priority: t.priority,
        // Without completion state: every task starts in the default status.
        status: null,
        milestone: t.milestoneId ? (milestoneKey.get(t.milestoneId) ?? null) : null,
        tags: names,
        start: offset(t.startDate),
        due: offset(t.dueDate),
        fields: values,
      };
    };
    const content: TemplateContent = {
      version: 1,
      project: { kind: project.kind, color: project.color, description: project.description },
      statuses: statuses.map((s) => ({
        name: s.name,
        category: s.category as TemplateContent['statuses'][number]['category'],
        isDefault: s.is_default === 1,
      })),
      tags: [],
      milestones: milestones.map((m) => ({
        key: milestoneKey.get(m.id)!,
        name: m.name,
        description: m.description,
        target: offset(m.targetDate),
      })),
      fields: fields.map((f) => ({
        key: fieldKey.get(f.id)!,
        name: f.name,
        type: f.type,
        options: f.options.map((o) => o.label),
      })),
      tasks: allTasks
        .filter((t) => t.parentTaskId === null)
        .map((t) => ({
          ...toTask(t),
          subtasks: allTasks.filter((s) => s.parentTaskId === t.id).map(toTask),
        })),
      notes: notes.map((n) => ({ title: n.title, body: n.body })),
    };
    content.tags = [...usedTags].map((name) => ({
      name,
      color: [...tagsById.values()].find((t) => t.name === name)?.color ?? null,
    }));
    return content;
  }

  private store(
    name: string,
    description: string | null,
    content: TemplateContent,
  ): TemplateSummary {
    const parsed = templateContentSchema.safeParse(content);
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', firstIssue(parsed.error));
    const json = JSON.stringify(parsed.data);
    if (json.length > MAX_TEMPLATE_TEXT) {
      throw new AppError('VALIDATION_FAILED', 'The project is too large to save as a template.');
    }
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    withUniqueName('A template with that name exists already.', () =>
      this.ctx.db
        .prepare(
          `INSERT INTO templates (id, name, name_key, description, content_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, name.trim(), nameKey(name), description?.trim() || null, json, now, now),
    );
    return toSummary(this.get(id));
  }

  private fromRow(row: Row): TemplateDetails {
    const parsed = templateContentSchema.safeParse(JSON.parse(row.content_json));
    if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'This template is damaged.');
    return summarize(row.id, row.name, row.description, false, parsed.data);
  }

  private requireStored(id: string): void {
    if (id.startsWith('builtin:')) {
      throw new AppError('VALIDATION_FAILED', 'Built-in templates cannot be changed.');
    }
    if (!this.ctx.db.prepare('SELECT 1 FROM templates WHERE id = ?').get(id)) {
      throw notFound('Template');
    }
  }
}
