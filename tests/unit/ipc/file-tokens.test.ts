import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/main/errors';
import { FileTokens } from '../../../src/main/ipc/file-tokens';

describe('FileTokens', () => {
  it('resolves issued tokens and rejects unknown, revoked, or expired ones', () => {
    let now = 0;
    const tokens = new FileTokens(() => now);
    const token = tokens.issue('C:\\backups\\work.pfbackup');
    expect(tokens.resolve(token)).toBe('C:\\backups\\work.pfbackup');
    expect(() => tokens.resolve('C:\\Windows\\win.ini')).toThrow(AppError);

    tokens.revoke(token);
    expect(() => tokens.resolve(token)).toThrow(/Choose the backup file again/);

    const later = tokens.issue('C:\\backups\\other.pfbackup');
    now += 16 * 60 * 1000;
    expect(() => tokens.resolve(later)).toThrow(AppError);
  });
});
