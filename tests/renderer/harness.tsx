import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { Project, Task, WorkflowStatus } from '../../src/shared/domain';
import type { IpcChannel } from '../../src/shared/ipc-channels';
import type { Result } from '../../src/shared/result';
import { createApi } from '../../src/preload/api';
import { DataProvider } from '../../src/renderer/app/data';
import { NavigationProvider } from '../../src/renderer/app/navigation';
import { QuickAddProvider } from '../../src/renderer/app/quick-add';
import { ToastProvider } from '../../src/renderer/app/toasts';

type Handler = (payload: Record<string, unknown>) => Result<unknown> | Promise<Result<unknown>>;

export interface FakeBackend {
  calls: { channel: IpcChannel; payload: Record<string, unknown> }[];
  callsTo(channel: IpcChannel): Record<string, unknown>[];
}

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

const DEFAULTS: Partial<Record<IpcChannel, unknown>> = {
  'projects:list': [],
  'tags:list': [],
  'folders:list': [],
  'noteFolders:list': [],
  'notes:list': [],
  'tasks:list': [],
  'trash:list': [],
  'dependencies:list': { prerequisites: [], dependents: [] },
  'settings:get': { theme: 'system', accent: 'blue', surface: 'cool', noteOutline: false },
};

/** Installs `window.api` built by the real bridge factory over a scripted fake backend. */
export function installApi(handlers: Partial<Record<IpcChannel, Handler>> = {}): FakeBackend {
  const calls: FakeBackend['calls'] = [];
  window.api = createApi(async (channel, payload) => {
    const body = payload as Record<string, unknown>;
    calls.push({ channel, payload: body });
    const handler = handlers[channel];
    if (handler) return handler(body);
    // Saving a note answers with the saved note, as the real service does.
    if (channel === 'notes:update') return ok(body);
    return ok(DEFAULTS[channel] ?? null);
  });
  return {
    calls,
    callsTo: (channel) => calls.filter((c) => c.channel === channel).map((c) => c.payload),
  };
}

export function renderWithApp(ui: ReactNode) {
  return render(
    <ToastProvider>
      <DataProvider>
        <NavigationProvider>
          <QuickAddProvider>{ui}</QuickAddProvider>
        </NavigationProvider>
      </DataProvider>
    </ToastProvider>,
  );
}

export { ok };

export function fail(message: string, code = 'VALIDATION_FAILED'): Result<never> {
  return { ok: false, error: { code: code as 'VALIDATION_FAILED', message } };
}

const NOW = '2026-03-10T09:00:00.000Z';

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    projectId: 'p1',
    parentTaskId: null,
    statusId: 's-todo',
    statusCategory: 'todo',
    title: 'Task',
    description: null,
    priority: null,
    startDate: null,
    dueDate: null,
    sortKey: 1024,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tagIds: [],
    prerequisiteIds: [],
    subtaskCount: 0,
    completedSubtaskCount: 0,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    folderId: null,
    name: 'Website',
    description: null,
    kind: 'general',
    status: 'active',
    isInbox: false,
    color: 'blue',
    startDate: null,
    targetDate: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    icon: null,
    cover: null,
    favourite: false,
    tagIds: [],
    ...overrides,
  };
}

export const STATUSES: WorkflowStatus[] = [
  { id: 's-todo', projectId: 'p1', name: 'To do', category: 'todo', sortKey: 1, isDefault: true },
  {
    id: 's-doing',
    projectId: 'p1',
    name: 'Doing',
    category: 'in_progress',
    sortKey: 2,
    isDefault: false,
  },
  { id: 's-done', projectId: 'p1', name: 'Done', category: 'done', sortKey: 3, isDefault: false },
];
