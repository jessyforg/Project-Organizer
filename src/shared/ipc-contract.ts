import { z } from 'zod';
import type { AppInfo, ProfileSummary } from './types';

export const PROFILE_NAME_MAX_LENGTH = 100;

export const profileNameSchema = z
  .string()
  .trim()
  .min(1, 'Profile name is required.')
  .max(
    PROFILE_NAME_MAX_LENGTH,
    `Profile name must be at most ${PROFILE_NAME_MAX_LENGTH} characters.`,
  );

const profileIdSchema = z.uuid();
const empty = z.strictObject({});

/**
 * Request schemas for every IPC channel. Payloads are validated in the main process;
 * unknown fields are rejected. The preload bridge imports only types from this file.
 */
export const ipcContract = {
  'app:getInfo': empty,
  'profiles:list': empty,
  'profiles:getActive': empty,
  'profiles:create': z.strictObject({ displayName: profileNameSchema }),
  'profiles:rename': z.strictObject({ id: profileIdSchema, displayName: profileNameSchema }),
  'profiles:switch': z.strictObject({ id: profileIdSchema }),
} as const;

export type IpcChannel = keyof typeof ipcContract;

/** Shape the renderer sends. */
export type IpcRequest<C extends IpcChannel> = z.input<(typeof ipcContract)[C]>;

/** Shape a handler receives after validation. */
export type IpcParsedRequest<C extends IpcChannel> = z.output<(typeof ipcContract)[C]>;

export interface IpcResponses {
  'app:getInfo': AppInfo;
  'profiles:list': ProfileSummary[];
  'profiles:getActive': ProfileSummary | null;
  'profiles:create': ProfileSummary;
  'profiles:rename': ProfileSummary;
  'profiles:switch': ProfileSummary;
}
