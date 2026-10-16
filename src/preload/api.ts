// Type-only imports: the sandboxed preload must not pull zod or other runtime modules.
import type { IpcChannel, IpcRequest, IpcResponses } from '@shared/ipc-contract';
import type { Result } from '@shared/result';

export type Invoke = (channel: IpcChannel, payload: unknown) => Promise<unknown>;

/** Builds the narrow API exposed to the renderer as `window.api`. */
export function createApi(invoke: Invoke) {
  const call = <C extends IpcChannel>(channel: C, payload: IpcRequest<C>) =>
    invoke(channel, payload) as Promise<Result<IpcResponses[C]>>;

  return {
    app: {
      getInfo: () => call('app:getInfo', {}),
    },
    profiles: {
      list: () => call('profiles:list', {}),
      getActive: () => call('profiles:getActive', {}),
      create: (input: IpcRequest<'profiles:create'>) => call('profiles:create', input),
      rename: (input: IpcRequest<'profiles:rename'>) => call('profiles:rename', input),
      switch: (input: IpcRequest<'profiles:switch'>) => call('profiles:switch', input),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
