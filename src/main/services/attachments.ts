import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AttachmentInfo, AttachmentKind } from '@shared/domain';
import { extractFileIds } from '@shared/app-links';
import { TRASH_RETENTION_DAYS } from '@shared/domain';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, type ServiceContext } from './context';

/** Largest single file (ADR-0017 stage 6). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** Largest total of a profile's attachments. */
export const MAX_PROFILE_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
/** Space left free on the disk after saving, so the database can still grow and back up. */
const FREE_SPACE_MARGIN = 100 * 1024 * 1024;

/** Kinds of file that run code when opened: saved, never opened from the app. */
const EXECUTABLE = new Set([
  'exe',
  'com',
  'bat',
  'cmd',
  'msi',
  'msp',
  'msc',
  'scr',
  'pif',
  'cpl',
  'dll',
  'sys',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'jar',
  'lnk',
  'url',
  'reg',
  'inf',
  'application',
  'appref-ms',
  'gadget',
  'scf',
  'sh',
  'py',
  'pyw',
  'iso',
  'img',
  'vhd',
  'vhdx',
]);

interface Row {
  id: string;
  name: string;
  kind: AttachmentKind;
  mime: string;
  size: number;
}

/** The image type the bytes start with, or null: decided from contents, never the name. */
export function sniffImage(data: Uint8Array): string | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  const ascii = (offset: number, text: string) =>
    [...text].every((c, i) => data[offset + i] === c.charCodeAt(0));
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  return null;
}

/** Only the file name: no folders, control characters, or surrounding spaces. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'file').slice(0, 255);
}

export function isExecutableName(name: string): boolean {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  return name.includes('.') && EXECUTABLE.has(extension);
}

const defaultFreeBytes = (dir: string) => {
  const stats = fs.statfsSync(dir);
  return stats.bavail * stats.bsize;
};

/**
 * Images and other files in notes (ADR-0017, stage 6), stored in the profile database so a
 * backup stays one encrypted file. A file stays while any note (even one in the trash) refers
 * to it; one no note has referred to for the trash retention period is removed.
 */
export class AttachmentService {
  private readonly freeBytes: () => number;

  constructor(
    private readonly ctx: ServiceContext,
    options: { freeBytes?: () => number } = {},
  ) {
    this.freeBytes = options.freeBytes ?? (() => defaultFreeBytes(path.dirname(this.ctx.db.name)));
  }

  add(input: { noteId: string; name: string; data: Uint8Array }): AttachmentInfo {
    const { db } = this.ctx;
    const note = db
      .prepare('SELECT archived_at FROM notes WHERE id = ? AND deleted_at IS NULL')
      .get(input.noteId) as { archived_at: string | null } | undefined;
    if (!note) throw notFound('Note');
    if (note.archived_at !== null) {
      throw new AppError('CONFLICT', 'Unarchive the note before adding files to it.');
    }
    const size = input.data.byteLength;
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new AppError('VALIDATION_FAILED', 'Files can be up to 20 MB.');
    }
    const used = (
      db.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM attachments').get() as {
        total: number;
      }
    ).total;
    if (used + size > MAX_PROFILE_ATTACHMENT_BYTES) {
      throw new AppError(
        'VALIDATION_FAILED',
        'This profile has 1 GB of files already. Remove some files from notes first.',
      );
    }
    if (this.freeBytes() < size + FREE_SPACE_MARGIN) {
      throw new AppError('NOT_ENOUGH_SPACE', 'The disk is nearly full. Free up some space first.');
    }

    const image = sniffImage(input.data);
    const row: Row = {
      id: this.ctx.newId(),
      name: cleanFileName(input.name),
      kind: image ? 'image' : 'file',
      mime: image ?? 'application/octet-stream',
      size,
    };
    // One statement: the file is either stored whole or not at all.
    db.prepare(
      `INSERT INTO attachments (id, note_id, name, kind, mime, size, sha256, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      input.noteId,
      row.name,
      row.kind,
      row.mime,
      row.size,
      createHash('sha256').update(input.data).digest('hex'),
      Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength),
      nowIso(this.ctx),
    );
    return this.toInfo(row);
  }

  /** Descriptions in the order asked; unknown or removed files are marked missing. */
  info(ids: string[]): AttachmentInfo[] {
    const unique = [...new Set(ids)];
    const rows =
      unique.length === 0
        ? []
        : (this.ctx.db
            .prepare(
              `SELECT id, name, kind, mime, size FROM attachments WHERE id IN (${placeholders(unique.length)})`,
            )
            .all(...unique) as Row[]);
    const found = new Map(rows.map((row) => [row.id, this.toInfo(row)]));
    return ids.map(
      (id) => found.get(id) ?? { id, name: '', kind: 'file', mime: '', size: 0, missing: true },
    );
  }

  /** The file's bytes, to save a copy or open it. */
  read(id: string): { name: string; mime: string; data: Uint8Array } {
    const row = this.ctx.db
      .prepare('SELECT name, mime, data FROM attachments WHERE id = ?')
      .get(id) as { name: string; mime: string; data: Buffer } | undefined;
    if (!row) throw notFound('File');
    return { name: row.name, mime: row.mime, data: new Uint8Array(row.data) };
  }

  /** An image's bytes, for showing it; anything that is not an image is refused. */
  readImage(id: string): { mime: string; data: Uint8Array } {
    const file = this.read(id);
    if (!file.mime.startsWith('image/')) {
      throw new AppError('VALIDATION_FAILED', 'This file is not an image.');
    }
    return { mime: file.mime, data: file.data };
  }

  /**
   * Runs when a profile opens and daily: files referred to by any note body (trashed notes
   * included) are kept; others are marked unused, and removed once unused for the retention
   * period. A file referred to again starts over.
   */
  cleanUp(): number {
    const { db } = this.ctx;
    const referenced = new Set<string>();
    const bodies = db
      .prepare("SELECT body FROM notes WHERE body LIKE '%projectforge://file/%'")
      .all() as { body: string }[];
    for (const { body } of bodies) for (const id of extractFileIds(body)) referenced.add(id);

    const now = nowIso(this.ctx);
    const cutoff = new Date(this.ctx.clock().getTime() - TRASH_RETENTION_DAYS * 86_400_000);
    const all = db.prepare('SELECT id, unused_since FROM attachments').all() as {
      id: string;
      unused_since: string | null;
    }[];
    const markUsed = db.prepare('UPDATE attachments SET unused_since = NULL WHERE id = ?');
    const markUnused = db.prepare('UPDATE attachments SET unused_since = ? WHERE id = ?');
    const remove = db.prepare('DELETE FROM attachments WHERE id = ?');
    let removed = 0;
    db.transaction(() => {
      for (const row of all) {
        if (referenced.has(row.id)) {
          if (row.unused_since !== null) markUsed.run(row.id);
        } else if (row.unused_since === null) {
          markUnused.run(now, row.id);
        } else if (new Date(row.unused_since) < cutoff) {
          remove.run(row.id);
          removed += 1;
        }
      }
    })();
    return removed;
  }

  private toInfo(row: Row): AttachmentInfo {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      mime: row.mime,
      size: row.size,
      missing: false,
      executable: isExecutableName(row.name),
    };
  }
}
