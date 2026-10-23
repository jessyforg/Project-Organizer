import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import type { AppLinkInfo, Note } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { TaskDetails } from '../../src/renderer/features/tasks/TaskDetails';
import { installApi, makeProject, makeTask, ok, renderWithApp, STATUSES } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const TASK = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f6a';
const PROJECT = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';
const GONE = '5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c';
const codec = createMarkdownCodec(noteExtensions());

const note = (body: string): Note => ({
  id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  projectId: 'p1',
  folderId: null,
  archivedAt: null,
  title: 'Standup',
  body,
  tagIds: [],
  createdAt: NOW,
  updatedAt: NOW,
  icon: null,
  cover: null,
  favourite: false,
});

const RESOLVED: Record<string, AppLinkInfo> = {
  [TASK]: {
    kind: 'task',
    id: TASK,
    label: 'Fix login',
    missing: false,
    archived: false,
    projectId: PROJECT,
    status: { name: 'In progress', category: 'in_progress' },
    dueDate: '2026-11-03',
  },
  [PROJECT]: {
    kind: 'project',
    id: PROJECT,
    label: 'Website',
    missing: false,
    archived: true,
    projectId: null,
  },
};

function Probe() {
  const { route, openTaskId } = useNavigation();
  return <p data-testid="probe">{JSON.stringify({ route, openTaskId })}</p>;
}

function setup(body: string) {
  const backend = installApi({
    'links:resolve': (payload) =>
      ok(
        (payload['targets'] as { kind: 'task'; id: string }[]).map(
          (t) =>
            RESOLVED[t.id] ?? {
              kind: t.kind,
              id: t.id,
              label: '',
              missing: true,
              archived: false,
              projectId: null,
            },
        ),
      ),
    'notes:backlinks': () => ok({ linked: [], unlinked: [] }),
    'search:query': () =>
      ok({
        tasks: [makeTask({ id: TASK, title: 'Fix login', dueDate: '2026-11-03' })],
        projects: [makeProject({ id: PROJECT, name: 'Login page revamp' })],
        notes: [],
      }),
  });
  renderWithApp(
    <>
      <Probe />
      <NoteEditor note={note(body)} />
    </>,
  );
  const editorBody = screen.queryByRole('textbox', { name: 'Note text' });
  const editor = (editorBody as unknown as { editor: Editor } | null)?.editor as Editor;
  const probe = () =>
    JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
      route: { name: string; id?: string };
      openTaskId: string | null;
    };
  return { backend, editor, editorBody: editorBody!, probe };
}

const mention = (kind: string, id: string, label: string) =>
  `[${label}](projectforge://${kind}/${id})`;

describe('the @ picker', () => {
  it('lists tasks and projects, title matches first, and inserts a mention', async () => {
    const { editor, editorBody } = setup('');
    await act(async () => {
      editor.commands.focus('end');
      editor.view.focus();
      editor.commands.insertContent('@fix');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const list = await screen.findByRole('listbox', { name: 'Mention a task or project' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.querySelector('.slash-menu__label')?.textContent),
      ).toEqual(['Fix login', 'Login page revamp']),
    );
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent(/Task · To do · due /);
    fireEvent.keyDown(editorBody, { key: 'Enter' });
    expect(codec.toMarkdown(editor.getJSON())).toBe(`${mention('task', TASK, 'Fix login')}\n`);
  });

  it('does not open for an @ inside a word, such as an email address', async () => {
    const { editor } = setup('');
    await act(async () => {
      editor.commands.focus('end');
      editor.view.focus();
      editor.commands.insertContent('me@example.com');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('listbox', { name: 'Mention a task or project' })).toBeNull();
  });
});

describe('mention chips', () => {
  it('show a task’s status and due date, and open its details', async () => {
    const { probe } = setup(`Blocked on ${mention('task', TASK, 'Fix login')}.\n`);
    const chip = await screen.findByRole('link', { name: /^Task: Fix login, In progress, due / });
    expect(chip.querySelector('.app-link__status')).toHaveAttribute('data-category', 'in_progress');
    expect(chip.querySelector('.app-link__due')).not.toBeNull();
    await userEvent.click(chip);
    expect(probe().openTaskId).toBe(TASK);
  });

  it('open a project, and say when it is archived', async () => {
    const { probe } = setup(`For ${mention('project', PROJECT, 'Website')}.\n`);
    const chip = await screen.findByRole('link', { name: 'Project: Website, archived' });
    await userEvent.click(chip);
    expect(probe().route).toEqual({ name: 'project', id: PROJECT });
  });

  it('show a trashed task as unavailable', async () => {
    const { probe } = setup(`${mention('task', GONE, 'Old task')}\n`);
    const chip = await screen.findByRole('link', { name: 'Task: Old task (not found)' });
    await userEvent.click(chip);
    expect(probe().openTaskId).toBeNull();
  });
});

describe('task details', () => {
  it('list the notes that mention the task, and open them', async () => {
    const task = makeTask({ id: TASK, title: 'Fix login' });
    const backend = installApi({
      'tasks:get': () => ok(task),
      'statuses:list': () => ok(STATUSES),
      'links:mentionedIn': () =>
        ok([
          {
            noteId: 'n1',
            title: 'Standup',
            snippet: 'Blocked on Fix login',
            archived: false,
            updatedAt: NOW,
          },
        ]),
    });
    renderWithApp(
      <>
        <Probe />
        <TaskDetails taskId={TASK} />
      </>,
    );
    const section = await screen.findByRole('region', { name: 'Mentioned in' });
    expect(within(section).getByRole('heading')).toHaveTextContent('Mentioned in 1 note');
    expect(backend.callsTo('links:mentionedIn')).toEqual([{ kind: 'task', id: TASK }]);
    await userEvent.click(within(section).getByRole('button', { name: 'Standup' }));
    expect(JSON.parse(screen.getByTestId('probe').textContent)).toMatchObject({
      route: { name: 'notes', noteId: 'n1' },
      openTaskId: null,
    });
  });

  it('leave the section out when no note mentions the task', async () => {
    installApi({
      'tasks:get': () => ok(makeTask({ id: TASK })),
      'statuses:list': () => ok(STATUSES),
      'links:mentionedIn': () => ok([]),
    });
    renderWithApp(<TaskDetails taskId={TASK} />);
    await screen.findByRole('heading', { name: 'Waiting on' });
    expect(screen.queryByRole('region', { name: 'Mentioned in' })).toBeNull();
  });
});
