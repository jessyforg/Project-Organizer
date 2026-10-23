import { coverValue, parseCover } from '@shared/covers';
import { parseIcon } from '@shared/icons';
import type {
  AddCoverImageInput,
  FavouriteTarget,
  SetCoverInput,
  SetIconInput,
} from '@shared/schemas';
import { AppError } from '../errors';
import { AttachmentService } from './attachments';
import { notFound, nowIso, type ServiceContext } from './context';

const TABLE = { project: 'projects', note: 'notes' } as const;

/**
 * Icons and covers of projects and notes (ADR-0019). Values are checked against the built-in
 * lists; an image cover must be an image in the attachment store. Archived notes are read-only.
 */
export class LooksService {
  private readonly attachments: AttachmentService;

  constructor(private readonly ctx: ServiceContext) {
    this.attachments = new AttachmentService(ctx);
  }

  setIcon(input: SetIconInput): void {
    if (input.value !== null && parseIcon(input.value) === null) {
      throw new AppError('VALIDATION_FAILED', 'Choose one of the built-in icons.');
    }
    this.write(input, 'icon', input.value);
  }

  setCover(input: SetCoverInput): void {
    const cover = input.value === null ? null : parseCover(input.value);
    if (input.value !== null && cover === null) {
      throw new AppError('VALIDATION_FAILED', 'Choose one of the covers.');
    }
    if (cover?.kind === 'image') {
      const [file] = this.attachments.info([cover.attachmentId]);
      if (!file || file.missing || file.kind !== 'image') throw notFound('Image');
    }
    this.write(input, 'cover', cover && coverValue(cover));
  }

  /** Stores an image and makes it the cover; returns the new cover value. */
  addCoverImage(input: AddCoverImageInput): string {
    this.requireEditable(input);
    const file = this.attachments.addCover({
      noteId: input.kind === 'note' ? input.id : null,
      name: input.name,
      data: input.data,
    });
    const value = coverValue({ kind: 'image', attachmentId: file.id });
    this.write(input, 'cover', value);
    return value;
  }

  private write(target: FavouriteTarget, column: 'icon' | 'cover', value: string | null): void {
    this.requireEditable(target);
    this.ctx.db
      .prepare(`UPDATE ${TABLE[target.kind]} SET ${column} = ?, updated_at = ? WHERE id = ?`)
      .run(value, nowIso(this.ctx), target.id);
  }

  private requireEditable({ kind, id }: FavouriteTarget): void {
    const row = this.ctx.db
      .prepare(`SELECT archived_at FROM ${TABLE[kind]} WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as { archived_at: string | null } | undefined;
    if (!row) throw notFound(kind === 'project' ? 'Project' : 'Note');
    if (kind === 'note' && row.archived_at !== null) {
      throw new AppError('CONFLICT', 'Unarchive the note first.');
    }
  }
}
