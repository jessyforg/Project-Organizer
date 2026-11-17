import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TemplateContent, TemplateDetails, TemplateSummary } from '../../src/shared/templates';
import {
  NewFromTemplateDialog,
  SaveTemplateDialog,
  TemplatesDialog,
} from '../../src/renderer/features/templates/TemplateDialogs';
import { fail, installApi, makeProject, ok, renderWithApp } from './harness';

const SAVED = '11111111-1111-4111-8111-111111111111';

const task = (title: string): TemplateContent['tasks'][number] => ({
  title,
  description: null,
  priority: null,
  status: null,
  milestone: null,
  tags: [],
  start: null,
  due: null,
  fields: {},
  subtasks: [],
});
/** A small template with this workflow and a dated milestone. */
const contentWith = (statuses: string[], milestone: string): TemplateContent => ({
  version: 1,
  project: { kind: 'general', color: null, description: null },
  statuses: statuses.map((name, i) => ({
    name,
    category: i === 0 ? 'todo' : i === statuses.length - 1 ? 'done' : 'in_progress',
    isDefault: i === 0,
  })),
  tags: [],
  milestones: [{ key: 'm', name: milestone, description: null, target: 70 }],
  fields: [{ key: 'f', name: 'Estimate', type: 'number', options: [] }],
  tasks: [task('First task'), task('Second task')],
  notes: [{ title: 'Brief', body: '' }],
});

const details = (id: string, name: string, builtIn: boolean): TemplateDetails => {
  const content = builtIn
    ? contentWith(['Backlog', 'In progress', 'In review', 'Done', "Won't do"], 'Launch')
    : contentWith(['To do', 'Doing', 'Done'], 'Review');
  return {
    id,
    name,
    description: null,
    builtIn,
    counts: { statuses: content.statuses.length, tasks: 6, milestones: 1, fields: 0, notes: 1 },
    hasDates: true,
    content,
  };
};
const summary = (d: TemplateDetails): TemplateSummary => ({
  id: d.id,
  name: d.name,
  description: d.description,
  builtIn: d.builtIn,
  counts: d.counts,
  hasDates: d.hasDates,
});
const SOFTWARE = details('builtin:software', 'Software development', true);
const MINE = details(SAVED, 'Weekly', false);

describe('new project from a template (ADR-0024)', () => {
  it('previews the chosen template and creates the project from it', async () => {
    const backend = installApi({
      'templates:list': () => ok([summary(SOFTWARE), summary(MINE)]),
      'templates:get': (payload) => ok(payload['id'] === SAVED ? MINE : SOFTWARE),
      'templates:createProject': () => ok(makeProject({ id: 'p9', name: 'App' })),
    });
    renderWithApp(<NewFromTemplateDialog open onClose={() => undefined} />);
    const preview = await screen.findByRole('region', { name: 'Preview' });
    expect(
      await within(preview).findByText("Backlog → In progress → In review → Done → Won't do"),
    ).toBeTruthy();
    expect(within(preview).getByText('· day 70')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /Weekly/ }));
    expect(await within(preview).findByText('To do → Doing → Done')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name for the project.');
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'App' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() =>
      expect(backend.callsTo('templates:createProject')).toEqual([
        { templateId: SAVED, name: 'App', startDate: '2026-04-01' },
      ]),
    );
  });
});

describe('saving a project as a template (ADR-0024)', () => {
  it('sends the name, description, and whether to keep dates', async () => {
    const backend = installApi({ 'templates:saveFromProject': () => ok(summary(MINE)) });
    renderWithApp(
      <SaveTemplateDialog open projectId="p1" projectName="Website" onClose={() => undefined} />,
    );
    expect(screen.getByLabelText('Template name')).toHaveProperty('value', 'Website');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Our usual setup' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Keep dates/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(backend.callsTo('templates:saveFromProject')).toEqual([
        { projectId: 'p1', name: 'Website', description: 'Our usual setup', keepDates: true },
      ]),
    );
  });
});

describe('managing templates (ADR-0024)', () => {
  it('renames saved ones, deletes after asking, and reports an invalid import', async () => {
    const backend = installApi({
      'templates:list': () => ok([summary(SOFTWARE), summary(MINE)]),
      'templates:rename': () => ok(summary(MINE)),
      'templates:delete': () => ok(null),
      'templates:import': () => fail('This is not a Katha template.'),
    });
    renderWithApp(<TemplatesDialog open onClose={() => undefined} />);
    const list = await screen.findByRole('list', { name: 'Templates' });
    await within(list).findByLabelText('Name of template Weekly');
    // Built-in templates cannot be renamed or deleted.
    expect(within(list).queryByRole('button', { name: 'Delete Software development' })).toBeNull();

    const name = within(list).getByLabelText('Name of template Weekly');
    fireEvent.change(name, { target: { value: 'Weekly plan' } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(backend.callsTo('templates:rename')).toEqual([{ id: SAVED, name: 'Weekly plan' }]),
    );

    fireEvent.click(within(list).getByRole('button', { name: 'Delete Weekly' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete the template “Weekly”?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete template' }));
    await waitFor(() => expect(backend.callsTo('templates:delete')).toEqual([{ id: SAVED }]));
    // The confirmation closed, but the templates dialog stays open.
    expect(screen.getByRole('dialog', { name: 'Templates' })).toBeTruthy();

    const file = new File(['{"format":"other"}'], 'x.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('template-import-input'), { target: { files: [file] } });
    expect((await screen.findByRole('alert')).textContent).toBe('This is not a Katha template.');
  });
});
