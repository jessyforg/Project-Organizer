import {
  ipcContract,
  type IpcChannel,
  type IpcParsedRequest,
  type IpcResponses,
} from '@shared/ipc-contract';
import type { Result } from '@shared/result';
import { AppError } from '../errors';
import type { Logger } from '../platform/logger';

/** The subset of Electron's IpcMainInvokeEvent the boundary relies on. */
export interface IpcEventLike {
  senderFrame: { url: string } | null;
}

export type ChannelImpl<C extends IpcChannel> = (
  request: IpcParsedRequest<C>,
) => IpcResponses[C] | Promise<IpcResponses[C]>;

export type ChannelImpls = { [C in IpcChannel]: ChannelImpl<C> };

export interface BoundaryOptions {
  isTrustedSender: (url: string) => boolean;
  logger: Logger;
}

/**
 * Wraps a channel implementation with the trusted-boundary checks:
 * sender origin, payload validation, and conversion of every outcome into a Result.
 */
export function createIpcHandler<C extends IpcChannel>(
  channel: C,
  impl: ChannelImpl<C>,
  options: BoundaryOptions,
): (event: IpcEventLike, payload: unknown) => Promise<Result<IpcResponses[C]>> {
  const schema = ipcContract[channel];
  return async (event, payload) => {
    const senderUrl = event.senderFrame?.url;
    if (senderUrl === undefined || !options.isTrustedSender(senderUrl)) {
      options.logger.warn('ipc.rejected_sender', { channel });
      return { ok: false, error: { code: 'FORBIDDEN_SENDER', message: 'Request rejected.' } };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Invalid request.',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
    }

    try {
      const data = await impl(parsed.data as IpcParsedRequest<C>);
      return { ok: true, data };
    } catch (error) {
      if (error instanceof AppError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        };
      }
      options.logger.error('ipc.unexpected_error', error, { channel });
      return {
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: 'Something went wrong. Details were written to the log.',
        },
      };
    }
  };
}

/** Registers every channel; the mapped type makes a missing implementation a compile error. */
export function registerIpcHandlers(
  ipcMain: {
    handle(channel: string, listener: (event: IpcEventLike, payload: unknown) => unknown): void;
  },
  impls: ChannelImpls,
  options: BoundaryOptions,
): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(
      channel,
      createIpcHandler(channel, impls[channel] as ChannelImpl<typeof channel>, options),
    );
  }
}
