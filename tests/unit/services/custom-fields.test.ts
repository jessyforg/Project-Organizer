import { describe, expect, it } from 'vitest';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { MAX_FIELDS } from '../../../src/main/services/custom-fields';
import { expectAppError, setupProfile, type TestProfile } from './setup';

async function withProject() {
  const p = await setupProfile();
  const site = p.projects.create({ name: 'Website' });
  const task = p.tasks.create({ title: 'Ship', projectId: site.id });
  return { p, site, task };
}

const valueOf = (p: TestProfile, taskId: string, fieldId: string) =>
  p.tasks.get(taskId).customValues[fieldId];

describe('custom fields (ADR-0023)', () => {
  it('stores each type of value, checked against the field, and clears empty ones', async () => {
    const { p, site, task } = await withProject();
    const text = p.customFields.create({ projectId: site.id, name: 'Notes', type: 'text' });
    const number = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'number' });
    const date = p.customFields.create({ projectId: site.id, name: 'Review', type: 'date' });
    const check = p.customFields.create({
      projectId: site.id,
      name: 'Signed off',
      type: 'checkbox',
    });
    const area = p.customFields.create({
      projectId: site.id,
      name: 'Area',
      type: 'select',
      options: ['Front end', 'Back end'],
    });
    const labels = p.customFields.create({
      projectId: site.id,
      name: 'Labels',
      type: 'multi_select',
      options: ['Bug', 'UX', 'Copy'],
    });
    const [front] = area.options;
    const [bug, ux] = labels.options;

    const set = (fieldId: string, value: unknown) =>
      p.customFields.setValue({ taskId: task.id, fieldId, value: value as never });
    set(text.id, '  Needs a review  ');
    set(number.id, 3.5);
    set(date.id, '2026-04-30');
    set(check.id, true);
    set(area.id, front!.id);
    set(labels.id, [ux!.id, bug!.id]);
    expect(p.tasks.get(task.id).customValues).toEqual({
      [text.id]: 'Needs a review',
      [number.id]: 3.5,
      [date.id]: '2026-04-30',
      [check.id]: true,
      [area.id]: front!.id,
      // Kept in the options' order.
      [labels.id]: [bug!.id, ux!.id],
    });

    await expectAppError(() => set(number.id, 'three'), 'VALIDATION_FAILED');
    await expectAppError(() => set(date.id, '2026-02-30'), 'VALIDATION_FAILED');
    await expectAppError(() => set(area.id, bug!.id), 'VALIDATION_FAILED');
    set(text.id, '   ');
    set(check.id, false);
    set(labels.id, []);
    set(number.id, null);
    expect(Object.keys(p.tasks.get(task.id).customValues).sort()).toEqual(
      [area.id, date.id].sort(),
    );
    expect(p.customFields.list(site.id).find((f) => f.id === area.id)?.valueCount).toBe(1);
  });

  it('refuses values for another project’s field, here and in the database', async () => {
    const { p, site } = await withProject();
    const other = p.projects.create({ name: 'Other' });
    const elsewhere = p.tasks.create({ title: 'Elsewhere', projectId: other.id });
    const field = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'number' });
    await expectAppError(
      () => p.customFields.setValue({ taskId: elsewhere.id, fieldId: field.id, value: 1 }),
      'VALIDATION_FAILED',
    );
    expect(() =>
      p.db
        .prepare('INSERT INTO custom_values (task_id, field_id, value_json) VALUES (?, ?, ?)')
        .run(elsewhere.id, field.id, '1'),
    ).toThrow(/another project/);
  });

  it('records value changes in the task’s activity, with the field’s name', async () => {
    const { p, site, task } = await withProject();
    const field = p.customFields.create({
      projectId: site.id,
      name: 'Area',
      type: 'select',
      options: ['Front end', 'Back end'],
    });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: field.options[0]!.id });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: field.options[1]!.id });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: field.options[1]!.id });
    const events = p.activity.forItem({ kind: 'task', id: task.id, limit: 10 });
    expect(events.slice(0, 2).map((e) => [e.field, e.oldValue, e.newValue])).toEqual([
      ['custom:Area', 'Front end', 'Back end'],
      ['custom:Area', null, 'Front end'],
    ]);
  });

  it('renames, keeps option IDs, and removes deleted options from values', async () => {
    const { p, site, task } = await withProject();
    const field = p.customFields.create({
      projectId: site.id,
      name: 'Labels',
      type: 'multi_select',
      options: ['Bug', 'UX'],
    });
    const [bug, ux] = field.options;
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: [bug!.id, ux!.id] });
    const updated = p.customFields.update({
      id: field.id,
      name: 'Tags',
      options: [{ id: ux!.id, label: 'User experience' }, { label: 'Copy' }],
    });
    expect(updated.name).toBe('Tags');
    expect(updated.options.map((o) => o.label)).toEqual(['User experience', 'Copy']);
    expect(updated.options[0]!.id).toBe(ux!.id);
    expect(valueOf(p, task.id, field.id)).toEqual([ux!.id]);
    await expectAppError(
      () => p.customFields.update({ id: field.id, options: [{ label: 'A' }, { label: 'a' }] }),
      'VALIDATION_FAILED',
    );
    p.customFields.create({ projectId: site.id, name: 'Notes', type: 'text' });
    await expectAppError(
      () => p.customFields.create({ projectId: site.id, name: 'notes', type: 'text' }),
      'CONFLICT',
    );
  });

  it('changes type when every value converts, and names the values that block it', async () => {
    const { p, site, task } = await withProject();
    const other = p.tasks.create({ title: 'Write copy', projectId: site.id });
    const field = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'text' });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: '3' });
    p.customFields.setValue({ taskId: other.id, fieldId: field.id, value: 'about 2' });
    await expectAppError(
      () => p.customFields.changeType({ id: field.id, type: 'number' }),
      'CONFLICT',
    );
    try {
      p.customFields.changeType({ id: field.id, type: 'number' });
    } catch (error) {
      expect((error as Error).message).toBe(
        '1 value cannot become a number: “about 2” (Write copy). Change or clear it first.',
      );
    }
    expect(p.customFields.get(field.id).type).toBe('text');

    // Text to a single choice: each distinct text becomes an option.
    const choice = p.customFields.changeType({ id: field.id, type: 'select' });
    expect(choice.options.map((o) => o.label)).toEqual(['3', 'about 2']);
    const three = choice.options[0]!.id;
    expect(valueOf(p, task.id, field.id)).toBe(three);
    // A single choice to multiple choices and back keeps the options.
    const multi = p.customFields.changeType({ id: field.id, type: 'multi_select' });
    expect(valueOf(p, task.id, field.id)).toEqual([three]);
    p.customFields.setValue({
      taskId: task.id,
      fieldId: field.id,
      value: multi.options.map((o) => o.id),
    });
    await expectAppError(
      () => p.customFields.changeType({ id: field.id, type: 'select' }),
      'CONFLICT',
    );
    // Anything becomes text.
    p.customFields.changeType({ id: field.id, type: 'text' });
    expect(valueOf(p, task.id, field.id)).toBe('3, about 2');
  });

  it('drops a task’s values when it moves to another project, and says how many', async () => {
    const { p, site, task } = await withProject();
    const other = p.projects.create({ name: 'Other' });
    const field = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'number' });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: 2 });
    expect(p.tasks.move({ id: task.id, projectId: other.id })).toMatchObject({
      removedFieldValues: 1,
    });
    expect(p.tasks.get(task.id).customValues).toEqual({});
  });

  it('goes to the trash with its values kept, alone or with its project', async () => {
    const { p, site, task } = await withProject();
    const field = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'number' });
    p.customFields.setValue({ taskId: task.id, fieldId: field.id, value: 5 });
    const { batchId } = p.trash.trashCustomField(field.id);
    expect(p.customFields.list(site.id)).toEqual([]);
    expect(p.tasks.get(task.id).customValues).toEqual({});
    expect(p.trash.list()).toEqual([
      expect.objectContaining({ kind: 'custom_field', title: 'Estimate', projectName: 'Website' }),
    ]);
    // The name is free meanwhile; restoring then explains the clash.
    const clash = p.customFields.create({ projectId: site.id, name: 'Estimate', type: 'text' });
    await expectAppError(() => p.trash.restore(batchId), 'CONFLICT');
    p.trash.trashCustomField(clash.id);
    expect(p.trash.restore(batchId)).toMatchObject({ restoredFields: 1 });
    expect(valueOf(p, task.id, field.id)).toBe(5);

    const { batchId: projectBatch } = p.trash.trashProject(site.id);
    expect(p.trash.list().find((e) => e.kind === 'project')?.itemCount).toBe(3);
    p.trash.restore(projectBatch);
    expect(p.customFields.list(site.id).map((f) => f.name)).toEqual(['Estimate']);

    p.trash.trashCustomField(field.id);
    p.trash.empty();
    expect(p.db.prepare('SELECT count(*) AS n FROM custom_values').get()).toEqual({ n: 0 });
  });

  it('limits fields per project and keeps archived projects’ fields unchanged', async () => {
    const { p, site } = await withProject();
    for (let i = 0; i < MAX_FIELDS; i += 1) {
      p.customFields.create({ projectId: site.id, name: `F${i}`, type: 'text' });
    }
    await expectAppError(
      () => p.customFields.create({ projectId: site.id, name: 'One more', type: 'text' }),
      'VALIDATION_FAILED',
    );
    const archived = p.projects.create({ name: 'Old' });
    const field = p.customFields.create({ projectId: archived.id, name: 'X', type: 'text' });
    p.projects.archive(archived.id);
    await expectAppError(() => p.customFields.update({ id: field.id, name: 'Y' }), 'CONFLICT');
    await expectAppError(() => p.trash.trashCustomField(field.id), 'CONFLICT');
  });

  it('checks inputs at the IPC boundary', () => {
    const set = ipcContract['customFields:setValue'];
    const id = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
    expect(set.safeParse({ taskId: id, fieldId: id, value: 2 }).success).toBe(true);
    expect(set.safeParse({ taskId: id, fieldId: id, value: { a: 1 } }).success).toBe(false);
    expect(set.safeParse({ taskId: id, fieldId: id, value: 'x'.repeat(1001) }).success).toBe(false);
    const create = ipcContract['customFields:create'];
    expect(create.safeParse({ projectId: id, name: 'A', type: 'colour' }).success).toBe(false);
  });
});
