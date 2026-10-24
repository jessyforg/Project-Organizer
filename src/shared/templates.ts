import { z } from 'zod';
import {
  COLOR_TOKENS,
  CUSTOM_FIELD_TYPES,
  PRIORITIES,
  PROJECT_KINDS,
  STATUS_CATEGORIES,
} from './domain';

/**
 * The content of a project template (ADR-0024), version 1. Every template passes this schema
 * when it is saved, imported, or read back, so sizes, counts, and string lengths are bounded.
 */
const text = (max: number) => z.string().trim().min(1).max(max);
/** Days from the project's start date; null when the item has no date. */
const offset = z.number().int().min(-3650).max(3650).nullable();
const fieldValue = z.union([
  z.string().max(1000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(60)).max(50),
]);

const taskBase = {
  title: text(500),
  description: z.string().max(20_000).nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  /** Index into `statuses`; null for the default status. */
  status: z.number().int().min(0).max(29).nullable(),
  /** Key of a milestone in `milestones`. */
  milestone: z.string().max(40).nullable(),
  tags: z.array(text(60)).max(20),
  start: offset,
  due: offset,
  /** By field key; choices are given by label. */
  fields: z.record(z.string().max(40), fieldValue),
};

export const templateContentSchema = z
  .strictObject({
    version: z.literal(1),
    project: z.strictObject({
      kind: z.enum(PROJECT_KINDS),
      color: z.enum(COLOR_TOKENS).nullable(),
      description: z.string().max(20_000).nullable(),
    }),
    statuses: z
      .array(
        z.strictObject({
          name: text(60),
          category: z.enum(STATUS_CATEGORIES),
          isDefault: z.boolean(),
        }),
      )
      .min(1)
      .max(30),
    tags: z
      .array(z.strictObject({ name: text(60), color: z.enum(COLOR_TOKENS).nullable() }))
      .max(50),
    milestones: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(40),
          name: text(200),
          description: z.string().max(20_000).nullable(),
          target: offset,
        }),
      )
      .max(50),
    fields: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(40),
          name: text(60),
          type: z.enum(CUSTOM_FIELD_TYPES),
          options: z.array(text(60)).max(50),
        }),
      )
      .max(30),
    tasks: z
      .array(
        z.strictObject({
          ...taskBase,
          subtasks: z.array(z.strictObject(taskBase)).max(100),
        }),
      )
      .max(1000),
    notes: z.array(z.strictObject({ title: text(500), body: z.string().max(200_000) })).max(100),
  })
  .superRefine((content, ctx) => {
    const count = content.tasks.reduce((n, t) => n + 1 + t.subtasks.length, 0);
    if (count > 1000) {
      ctx.addIssue({ code: 'custom', message: 'The template has too many tasks (over 1,000).' });
    }
    const defaults = content.statuses.filter((s) => s.isDefault);
    if (
      defaults.length !== 1 ||
      (defaults[0]!.category !== 'todo' && defaults[0]!.category !== 'in_progress')
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A template needs exactly one default status, of the "to do" or "in progress" kind.',
      });
    }
    if (!content.statuses.some((s) => s.category === 'done')) {
      ctx.addIssue({ code: 'custom', message: 'A template needs a "done" status.' });
    }
    const milestones = new Set(content.milestones.map((m) => m.key));
    const fields = new Set(content.fields.map((f) => f.key));
    for (const task of content.tasks.flatMap((t) => [t, ...t.subtasks])) {
      if (task.status !== null && task.status >= content.statuses.length) {
        ctx.addIssue({ code: 'custom', message: `“${task.title}” uses a status that is missing.` });
      }
      if (task.milestone !== null && !milestones.has(task.milestone)) {
        ctx.addIssue({
          code: 'custom',
          message: `“${task.title}” uses a milestone that is missing.`,
        });
      }
      for (const key of Object.keys(task.fields)) {
        if (!fields.has(key)) {
          ctx.addIssue({
            code: 'custom',
            message: `“${task.title}” uses a field that is missing.`,
          });
        }
      }
    }
  });

export type TemplateContent = z.infer<typeof templateContentSchema>;
export type TemplateTask = TemplateContent['tasks'][number];

/** An exported template file. */
export const TEMPLATE_FORMAT = 'projectforge-template';
export const templateFileSchema = z.strictObject({
  format: z.literal(TEMPLATE_FORMAT),
  version: z.literal(1),
  name: text(100),
  description: z.string().max(1000).nullable(),
  content: templateContentSchema,
});

/** Largest template file or text accepted, in characters. */
export const MAX_TEMPLATE_TEXT = 4 * 1024 * 1024;

/** A template as listed (ADR-0024). Built-in ones have IDs starting with `builtin:`. */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  builtIn: boolean;
  counts: { statuses: number; tasks: number; milestones: number; fields: number; notes: number };
  /** Some item has a date, so creating a project asks for a start date. */
  hasDates: boolean;
}

export interface TemplateDetails extends TemplateSummary {
  content: TemplateContent;
}
