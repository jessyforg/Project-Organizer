import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/main/errors';
import {
  createIpcHandler,
  registerIpcHandlers,
  type ChannelImpls,
} from '../../../src/main/ipc/handler';
import { nullLogger } from '../../../src/main/platform/logger';
import { isTrustedOrigin } from '../../../src/main/security';
import { ipcContract } from '../../../src/shared/ipc-contract';

const options = { isTrustedSender: (url: string) => isTrustedOrigin(url), logger: nullLogger };
const trusted = { senderFrame: { url: 'app://renderer/index.html' } };
const profile = {
  id: '6f1c2a7e-4b8d-4c1e-9a3f-2d5e6b7c8d9e',
  displayName: 'Work',
  createdAt: 'x',
  lastOpenedAt: null,
};

describe('createIpcHandler', () => {
  it('passes validated, trimmed input to the implementation', async () => {
    const impl = vi.fn(() => profile);
    const handler = createIpcHandler('profiles:create', impl, options);
    const result = await handler(trusted, { displayName: '  Work  ' });
    expect(result).toEqual({ ok: true, data: profile });
    expect(impl).toHaveBeenCalledWith({ displayName: 'Work' });
  });

  it.each([
    ['missing field', {}],
    ['empty name', { displayName: '   ' }],
    ['too long', { displayName: 'x'.repeat(101) }],
    ['wrong type', { displayName: 42 }],
    ['unknown field', { displayName: 'Work', isAdmin: true }],
    ['not an object', 'Work'],
    ['null', null],
  ])('rejects %s without calling the implementation', async (_label, payload) => {
    const impl = vi.fn(() => profile);
    const result = await createIpcHandler('profiles:create', impl, options)(trusted, payload);
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(impl).not.toHaveBeenCalled();
  });

  it('rejects malformed profile IDs', async () => {
    const result = await createIpcHandler(
      'profiles:switch',
      () => profile,
      options,
    )(trusted, { id: '../../etc' });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it.each([
    'https://evil.example/',
    'file:///C:/index.html',
    'app://other/index.html',
    'not a url',
  ])('rejects requests from untrusted sender %s', async (url) => {
    const impl = vi.fn(() => [profile]);
    const result = await createIpcHandler(
      'profiles:list',
      impl,
      options,
    )({ senderFrame: { url } }, {});
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
    expect(impl).not.toHaveBeenCalled();
  });

  it('rejects requests with no sender frame', async () => {
    const result = await createIpcHandler(
      'profiles:list',
      () => [],
      options,
    )({ senderFrame: null }, {});
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
  });

  it('returns AppError details as a typed failure', async () => {
    const handler = createIpcHandler(
      'profiles:create',
      () => {
        throw new AppError('CONFLICT', 'A profile with this name already exists.');
      },
      options,
    );
    expect(await handler(trusted, { displayName: 'Work' })).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: 'A profile with this name already exists.' },
    });
  });

  it('hides unexpected error messages from the renderer and logs them', async () => {
    const logger = { ...nullLogger, error: vi.fn() };
    const handler = createIpcHandler(
      'profiles:list',
      () => {
        throw new Error('SQL detail with C:\\secret\\path');
      },
      { ...options, logger },
    );
    const result = await handler(trusted, {});
    expect(result).toMatchObject({ ok: false, error: { code: 'UNEXPECTED' } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('registerIpcHandlers', () => {
  it('registers exactly the channels in the contract', () => {
    const handle = vi.fn();
    const impls = Object.fromEntries(
      Object.keys(ipcContract).map((c) => [c, () => null]),
    ) as unknown as ChannelImpls;
    registerIpcHandlers({ handle }, impls, options);
    expect(handle.mock.calls.map((call) => call[0] as string).sort()).toEqual(
      Object.keys(ipcContract).sort(),
    );
  });
});
