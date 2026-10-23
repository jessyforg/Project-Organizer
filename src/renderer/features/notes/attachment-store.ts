import { createContext, useEffect, useState } from 'react';
import type { AttachmentInfo } from '@shared/domain';
import { useDataVersion } from '../../app/data';
import { useToast } from '../../app/toasts';
import type { AttachmentStore } from '../editor/attachments';

const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

interface Actions {
  upload: (file: File) => Promise<AttachmentInfo | null>;
  save: (id: string) => void;
  open: (id: string) => void;
}

/**
 * Images and files for one note's editor and preview (ADR-0017 stage 6): file details are looked
 * up in batches, images are loaded once into object URLs (released with the note), and uploads
 * go to the current note.
 */
export function createAttachmentStore(): AttachmentStore & {
  refresh: () => void;
  setActions: (actions: Actions) => void;
  dispose: () => void;
} {
  const infos = new Map<string, AttachmentInfo>();
  const urls = new Map<string, string>();
  const loadingImages = new Set<string>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  let version = 0;
  let scheduled = false;
  let actions: Actions = {
    upload: () => Promise.resolve(null),
    save: () => undefined,
    open: () => undefined,
  };

  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };
  const flush = async () => {
    scheduled = false;
    const ids = [...pending];
    pending.clear();
    if (ids.length === 0) return;
    const result = await window.api.attachments.info({ ids });
    if (result.ok) for (const info of result.data) infos.set(info.id, info);
    notify();
  };
  const loadImage = async (id: string) => {
    if (urls.has(id) || loadingImages.has(id)) return;
    loadingImages.add(id);
    const result = await window.api.attachments.readImage({ id });
    loadingImages.delete(id);
    if (result.ok) {
      const bytes = new Uint8Array(result.data.data);
      urls.set(id, URL.createObjectURL(new Blob([bytes], { type: result.data.mime })));
      notify();
    }
  };

  return {
    info: (id) => infos.get(id),
    imageUrl: (id) => urls.get(id),
    request: (id, options) => {
      if (!infos.has(id)) {
        pending.add(id);
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(() => void flush());
        }
      }
      if (options?.image) void loadImage(id);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
    upload: async (file) => {
      const info = await actions.upload(file);
      if (info) {
        infos.set(info.id, info);
        notify();
      }
      return info;
    },
    pick: (kind) =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        if (kind === 'image') input.accept = IMAGE_TYPES;
        input.addEventListener('change', () => resolve([...(input.files ?? [])]));
        input.addEventListener('cancel', () => resolve([]));
        input.click();
      }),
    save: (id) => actions.save(id),
    open: (id) => actions.open(id),
    refresh: () => {
      for (const id of infos.keys()) pending.add(id);
      if (!scheduled && pending.size > 0) {
        scheduled = true;
        queueMicrotask(() => void flush());
      }
    },
    setActions: (next) => {
      actions = next;
    },
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

/** The attachments of the note on screen, for the Markdown preview. */
export const AttachmentContext = createContext<AttachmentStore | null>(null);

/** The attachment store for a note: uploads go to it, and problems are reported as toasts. */
export function useAttachmentStore(noteId: string): AttachmentStore {
  const [store] = useState(createAttachmentStore);
  const version = useDataVersion();
  const toast = useToast();

  useEffect(() => store.refresh(), [store, version]);
  useEffect(() => () => store.dispose(), [store]);

  useEffect(() => {
    store.setActions({
      upload: async (file) => {
        const data = new Uint8Array(await file.arrayBuffer());
        const result = await window.api.attachments.add({ noteId, name: file.name, data });
        if (result.ok) return result.data;
        toast({ message: `“${file.name}” was not added. ${result.error.message}`, tone: 'error' });
        return null;
      },
      save: (id) =>
        void window.api.attachments.save({ id }).then((result) => {
          if (!result.ok) toast({ message: result.error.message, tone: 'error' });
          else if (result.data.saved) toast({ message: `Saved “${result.data.fileName}”.` });
        }),
      open: (id) =>
        void window.api.attachments.open({ id }).then((result) => {
          if (!result.ok) toast({ message: result.error.message, tone: 'error' });
        }),
    });
  });

  return store;
}
