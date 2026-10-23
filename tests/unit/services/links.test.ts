import { describe, expect, it } from 'vitest';
import { setupProfile, statusOf } from './setup';

const MISSING = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';

describe('resolving app links (ADR-0017)', () => {
  it('gives the current title of notes, tasks, and projects, in the order asked', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const task = p.tasks.create({
      title: 'Fix login',
      projectId: project.id,
      dueDate: '2026-11-03',
    });
    const note = p.notes.create({ title: 'Roadmap' });
    p.notes.update({ id: note.id, title: 'Roadmap 2027' });
    const resolved = p.links.resolve({
      targets: [
        { kind: 'task', id: task.id },
        { kind: 'note', id: note.id },
        { kind: 'project', id: project.id },
      ],
    });
    expect(resolved).toEqual([
      expect.objectContaining({
        kind: 'task',
        id: task.id,
        label: 'Fix login',
        missing: false,
        dueDate: '2026-11-03',
        status: { name: statusOf(p, project.id, 'todo').name, category: 'todo' },
        projectId: project.id,
      }),
      expect.objectContaining({ kind: 'note', label: 'Roadmap 2027', missing: false }),
      expect.objectContaining({ kind: 'project', label: 'Website', archived: false }),
    ]);
  });

  it('lists the notes that mention a task or project, with a snippet (stage 5)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const task = p.tasks.create({ title: 'Fix login', projectId: project.id });
    const mention = `[Fix login](projectforge://task/${task.id})`;
    const note = p.notes.create({ title: 'Standup', body: `Blocked on ${mention} today.` });
    const gone = p.notes.create({ title: 'Gone', body: mention });
    p.trash.trashNote(gone.id);
    p.notes.create({ title: 'Project', body: `[Website](projectforge://project/${project.id})` });
    expect(p.links.mentionedIn({ kind: 'task', id: task.id })).toEqual([
      expect.objectContaining({
        noteId: note.id,
        title: 'Standup',
        snippet: 'Blocked on Fix login today.',
      }),
    ]);
    expect(p.links.mentionedIn({ kind: 'project', id: project.id }).map((b) => b.title)).toEqual([
      'Project',
    ]);
  });

  it('reports missing and trashed items as missing, and archived ones as archived', async () => {
    const p = await setupProfile();
    const trashed = p.notes.create({ title: 'Gone' });
    p.trash.trashNote(trashed.id);
    const archived = p.notes.archive(p.notes.create({ title: 'Old' }).id);
    const resolved = p.links.resolve({
      targets: [
        { kind: 'note', id: MISSING },
        { kind: 'note', id: trashed.id },
        { kind: 'note', id: archived.id },
      ],
    });
    expect(resolved.map((r) => [r.missing, r.archived])).toEqual([
      [true, false],
      [true, false],
      [false, true],
    ]);
  });
});
