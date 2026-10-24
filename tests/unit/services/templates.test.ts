import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from '../../../src/main/templates/builtin';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { templateContentSchema } from '../../../src/shared/templates';
import { expectAppError, setupProfile, statusOf, type TestProfile } from './setup';

const count = (p: TestProfile, table: string) =>
  (p.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('built-in templates (ADR-0024)', () => {
  it('are valid, and each builds a project with its whole structure', async () => {
    const p = await setupProfile();
    for (const builtIn of BUILT_IN_TEMPLATES) {
      expect(templateContentSchema.safeParse(builtIn.content).success).toBe(true);
      const summary = p.templates.list().find((t) => t.id === builtIn.id)!;
      expect(summary).toMatchObject({ builtIn: true, hasDates: true });
      const project = p.templates.createProject({
        templateId: builtIn.id,
        name: builtIn.name,
        startDate: '2026-04-01',
      });
      const statuses = p.statuses.listForProject(project.id);
      expect(statuses.map((s) => s.name)).toEqual(builtIn.content.statuses.map((s) => s.name));
      const tasks = p.tasks.list({ projectId: project.id, limit: 5000 });
      expect(tasks).toHaveLength(summary.counts.tasks);
      expect(tasks.every((t) => t.statusCategory !== 'done')).toBe(true);
      expect(p.milestones.list(project.id)).toHaveLength(summary.counts.milestones);
      expect(p.customFields.list(project.id)).toHaveLength(summary.counts.fields);
      expect(p.notes.list({ projectId: project.id })).toHaveLength(summary.counts.notes);
    }
  });

  it('dates milestones and tasks from the start date, and fills field values by label', async () => {
    const p = await setupProfile();
    const project = p.templates.createProject({
      templateId: 'builtin:software',
      name: 'App',
      startDate: '2026-04-01',
    });
    expect(p.projects.get(project.id).startDate).toBe('2026-04-01');
    const launch = p.milestones.list(project.id).find((m) => m.name === 'Launch')!;
    expect(launch.targetDate).toBe('2026-06-10');
    const design = p.tasks
      .list({ projectId: project.id, limit: 100 })
      .find((t) => t.title === 'Design the architecture')!;
    const area = p.customFields.list(project.id).find((f) => f.name === 'Area')!;
    expect(design.customValues[area.id]).toBe(area.options.find((o) => o.label === 'Back end')!.id);
    expect(design.milestoneId).not.toBeNull();
    expect(p.tags.list().map((t) => t.name)).toEqual(
      expect.arrayContaining(['Bug', 'Chore', 'Feature']),
    );
  });
});

describe('creating from a template (ADR-0024)', () => {
  it('is all or nothing: a failure part way leaves nothing behind', async () => {
    const p = await setupProfile();
    const content = structuredClone(BUILT_IN_TEMPLATES[0]!.content);
    // The last task's start is after its due date, which tasks refuse.
    content.tasks.push({
      ...content.tasks[0]!,
      title: 'Impossible',
      start: 10,
      due: 1,
      subtasks: [],
    });
    const template = p.templates.import(
      JSON.stringify({
        format: 'projectforge-template',
        version: 1,
        name: 'Broken',
        description: null,
        content,
      }),
    );
    const before = [
      'projects',
      'tasks',
      'milestones',
      'custom_fields',
      'notes',
      'tags',
      'activity_events',
    ].map((table) => count(p, table));
    await expectAppError(
      () =>
        p.templates.createProject({
          templateId: template.id,
          name: 'Nope',
          startDate: '2026-04-01',
        }),
      'VALIDATION_FAILED',
    );
    expect(
      ['projects', 'tasks', 'milestones', 'custom_fields', 'notes', 'tags', 'activity_events'].map(
        (table) => count(p, table),
      ),
    ).toEqual(before);
  });

  it('never changes the template', async () => {
    const p = await setupProfile();
    const saved = p.templates.import(
      JSON.stringify({
        format: 'projectforge-template',
        version: 1,
        name: 'Mine',
        description: null,
        content: BUILT_IN_TEMPLATES[1]!.content,
      }),
    );
    const before = p.templates.get(saved.id);
    p.templates.createProject({ templateId: saved.id, name: 'Week 1' });
    p.templates.createProject({ templateId: saved.id, name: 'Week 2' });
    expect(p.templates.get(saved.id)).toEqual(before);
  });
});

describe('saving a project as a template (ADR-0024)', () => {
  it('copies the structure without completion, with dates as days when asked', async () => {
    const p = await setupProfile();
    const site = p.projects.create({ name: 'Website', startDate: '2026-03-01', color: 'teal' });
    const beta = p.milestones.create({
      projectId: site.id,
      name: 'Beta',
      targetDate: '2026-03-15',
    });
    const area = p.customFields.create({
      projectId: site.id,
      name: 'Area',
      type: 'select',
      options: ['Front', 'Back'],
    });
    const tag = p.tags.create({ name: 'Bug', color: 'red' });
    const parent = p.tasks.create({
      title: 'Build',
      projectId: site.id,
      dueDate: '2026-03-10',
      tagIds: [tag.id],
      milestoneId: beta.id,
    });
    p.tasks.create({ title: 'Part', parentTaskId: parent.id });
    p.customFields.setValue({ taskId: parent.id, fieldId: area.id, value: area.options[1]!.id });
    p.tasks.setCompleted(parent.id, true);
    p.notes.create({ projectId: site.id, title: 'Brief', body: '# Brief' });

    const dated = p.templates.saveFromProject({
      projectId: site.id,
      name: 'Site',
      keepDates: true,
    });
    const content = p.templates.get(dated.id).content;
    expect(content.milestones).toEqual([
      { key: 'm1', name: 'Beta', description: null, target: 14 },
    ]);
    expect(content.tasks[0]).toMatchObject({
      title: 'Build',
      status: null,
      due: 9,
      tags: ['Bug'],
      milestone: 'm1',
      fields: { f1: 'Back' },
      subtasks: [expect.objectContaining({ title: 'Part' })],
    });
    expect(content.tags).toEqual([{ name: 'Bug', color: 'red' }]);
    expect(content.notes).toEqual([{ title: 'Brief', body: '# Brief' }]);

    const undated = p.templates.saveFromProject({
      projectId: site.id,
      name: 'Site 2',
      keepDates: false,
    });
    expect(p.templates.get(undated.id).hasDates).toBe(false);

    // Round trip: the copy has the structure, and nothing is completed.
    const copy = p.templates.createProject({
      templateId: dated.id,
      name: 'Website 2',
      startDate: '2026-05-01',
    });
    const tasks = p.tasks.list({ projectId: copy.id, limit: 100 });
    expect(tasks.map((t) => t.title).sort()).toEqual(['Build', 'Part']);
    expect(tasks.find((t) => t.title === 'Build')).toMatchObject({
      dueDate: '2026-05-10',
      statusId: statusOf(p, copy.id, 'todo').id,
    });
  });
});

describe('managing templates (ADR-0024)', () => {
  it('renames and deletes saved templates, never built-in ones', async () => {
    const p = await setupProfile();
    const site = p.projects.create({ name: 'Website' });
    const saved = p.templates.saveFromProject({
      projectId: site.id,
      name: 'Site',
      keepDates: false,
    });
    expect(p.templates.rename({ id: saved.id, name: 'Website starter' }).name).toBe(
      'Website starter',
    );
    await expectAppError(
      () =>
        p.templates.saveFromProject({
          projectId: site.id,
          name: 'website STARTER',
          keepDates: false,
        }),
      'CONFLICT',
    );
    await expectAppError(() => p.templates.delete('builtin:study'), 'VALIDATION_FAILED');
    p.templates.delete(saved.id);
    expect(p.templates.list().filter((t) => !t.builtIn)).toEqual([]);
  });

  it('exports and imports, refusing anything that is not a valid template', async () => {
    const p = await setupProfile();
    const document = p.templates.exportDocument('builtin:study');
    const first = p.templates.import(JSON.stringify(document));
    const second = p.templates.import(JSON.stringify(document));
    expect([first.name, second.name]).toEqual(['Study and learning', 'Study and learning (2)']);

    const refuse = (text: string, message: RegExp) => {
      let caught: unknown;
      try {
        p.templates.import(text);
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).message).toMatch(message);
    };
    refuse('not json', /not a ProjectForge template/);
    refuse(JSON.stringify({ format: 'other' }), /not a ProjectForge template/);
    const many = structuredClone(document);
    many.content.tasks = Array.from({ length: 1001 }, (_, i) => ({
      ...document.content.tasks[0]!,
      title: `T${i}`,
      subtasks: [],
    }));
    refuse(JSON.stringify(many), /too many tasks/);
    const noDone = structuredClone(document);
    noDone.content.statuses = noDone.content.statuses.filter((s) => s.category !== 'done');
    refuse(JSON.stringify(noDone), /needs a "done" status/);
  });

  it('checks inputs at the IPC boundary', () => {
    expect(
      ipcContract['templates:import'].safeParse({ text: 'x'.repeat(4 * 1024 * 1024 + 1) }).success,
    ).toBe(false);
    expect(
      ipcContract['templates:createProject'].safeParse({ templateId: 'builtin:software', name: '' })
        .success,
    ).toBe(false);
  });
});
