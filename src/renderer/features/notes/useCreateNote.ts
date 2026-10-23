import { useCallback } from 'react';
import { useInvalidate } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { UNTITLED } from './NoteEditor';

export interface NoteTarget {
  projectId?: string | undefined;
  folderId?: string | null | undefined;
}

/**
 * Creates an untitled note and opens it. Shared by the Notes page's button and the command
 * palette (ADR-0018). Without a project, the note goes to the Inbox.
 */
export function useCreateNote(): (target?: NoteTarget) => Promise<void> {
  const invalidate = useInvalidate();
  const toast = useToast();
  const { navigate } = useNavigation();
  return useCallback(
    async (target: NoteTarget = {}) => {
      const result = await window.api.notes.create({ title: UNTITLED, ...target });
      if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
      invalidate();
      navigate({ name: 'notes', noteId: result.data.id });
    },
    [invalidate, toast, navigate],
  );
}
