// Type-only imports from the contract: the sandboxed preload must not pull zod at runtime.
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc-channels';
import type { IpcRequest, IpcResponses } from '@shared/ipc-contract';
import type { Result } from '@shared/result';

export type Invoke = (channel: IpcChannel, payload: unknown) => Promise<unknown>;

type Domain = IpcChannel extends `${infer D}:${string}` ? D : never;
type ActionsOf<D extends Domain> = Extract<IpcChannel, `${D}:${string}`>;
type ActionName<C extends IpcChannel> = C extends `${string}:${infer A}` ? A : never;

/** Channels whose request is an empty object can be called without an argument. */
type Call<C extends IpcChannel> =
  Record<never, never> extends IpcRequest<C>
    ? (payload?: IpcRequest<C>) => Promise<Result<IpcResponses[C]>>
    : (payload: IpcRequest<C>) => Promise<Result<IpcResponses[C]>>;

export type Api = {
  [D in Domain]: { [C in ActionsOf<D> as ActionName<C>]: Call<C> };
};

/**
 * Builds `window.api`: one named function per channel in the fixed list, e.g.
 * `api.tasks.create(input)` → `tasks:create`. There is no generic invoke.
 */
export function createApi(invoke: Invoke): Api {
  const api: Record<string, Record<string, (payload?: unknown) => Promise<unknown>>> = {};
  for (const channel of IPC_CHANNELS) {
    const [domain, action] = channel.split(':') as [string, string];
    api[domain] ??= {};
    api[domain][action] = (payload?: unknown) => invoke(channel, payload ?? {});
  }
  for (const group of Object.values(api)) Object.freeze(group);
  return Object.freeze(api) as unknown as Api;
}
