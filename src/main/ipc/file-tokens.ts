import { randomUUID } from 'node:crypto';
import { AppError } from '../errors';

const LIFETIME_MS = 15 * 60 * 1000;

/**
 * Files chosen in a main-process dialog are referred to by short-lived opaque tokens,
 * so the renderer never sends file paths (SECURITY.md: no arbitrary paths from the renderer).
 */
export class FileTokens {
  private readonly files = new Map<string, { path: string; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(filePath: string): string {
    this.prune();
    const token = randomUUID();
    this.files.set(token, { path: filePath, expires: this.now() + LIFETIME_MS });
    return token;
  }

  resolve(token: string): string {
    this.prune();
    const entry = this.files.get(token);
    if (!entry) throw new AppError('NOT_FOUND', 'Choose the backup file again.');
    return entry.path;
  }

  revoke(token: string): void {
    this.files.delete(token);
  }

  private prune(): void {
    const now = this.now();
    for (const [token, entry] of this.files) if (entry.expires < now) this.files.delete(token);
  }
}
