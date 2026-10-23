import { Extension, Node, type Editor, type JSONContent } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { MarkdownToken } from '@tiptap/core';
import { escapeLinkLabel, fileUrl, parseFileUrl, unescapeLinkLabel } from '@shared/app-links';
import type { AttachmentInfo } from '@shared/domain';

/**
 * Images and other files in notes (ADR-0017, stage 6). In Markdown an image is
 * `![description](projectforge://file/<id>)` and a file `[name](projectforge://file/<id>)`; the
 * bytes live with the profile. Images on the web are never loaded: they still keep a note in
 * Markdown mode.
 */

/** What attachments need from the app. */
export interface AttachmentStore {
  info: (id: string) => AttachmentInfo | undefined;
  /** An object URL for an image, once loaded; undefined until then. */
  imageUrl: (id: string) => string | undefined;
  request: (id: string, options?: { image?: boolean }) => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
  /** Stores a file with the note; null when it was refused (the user is told why). */
  upload: (file: File) => Promise<AttachmentInfo | null>;
  /** Asks for files with the system's file picker. */
  pick: (kind: 'image' | 'file') => Promise<File[]>;
  save: (id: string) => void;
  open: (id: string) => void;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE_LINK_AT_START = new RegExp(
  `^\\[((?:\\\\.|[^\\]\\\\\\n])*)\\]\\(projectforge://file/(${UUID})\\)`,
);
const FILE_LINK_ANYWHERE = new RegExp(
  `(?<!!)\\[(?:\\\\.|[^\\]\\\\\\n])*\\]\\(projectforge://file/`,
);

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentNode(info: AttachmentInfo): JSONContent {
  return info.kind === 'image'
    ? { type: 'noteImage', attrs: { id: info.id, alt: '' } }
    : { type: 'fileAttachment', attrs: { id: info.id, name: info.name } };
}

// ---------- Images ----------

export const NoteImage = Node.create<{ store: AttachmentStore | null }>({
  name: 'noteImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  markdownTokenName: 'image',

  addOptions() {
    return { store: null };
  },

  addAttributes() {
    return { id: { default: '' }, alt: { default: '' } };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-file]',
        getAttrs: (element) => ({
          id: element.getAttribute('data-file'),
          alt: element.getAttribute('alt') ?? '',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['img', { 'data-file': node.attrs['id'] as string, alt: node.attrs['alt'] as string }];
  },

  addNodeView() {
    const { store } = this.options;
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'note-image';
      dom.contentEditable = 'false';
      const frame = document.createElement('span');
      frame.className = 'note-image__frame';
      const img = document.createElement('img');
      const status = document.createElement('span');
      status.className = 'note-image__status';
      const alt = document.createElement('input');
      alt.type = 'text';
      alt.className = 'note-image__alt';
      alt.placeholder = 'Describe this image';
      alt.setAttribute('aria-label', 'Image description (alt text)');
      frame.append(img, status);
      dom.append(frame, alt);

      const id = () => current.attrs['id'] as string;
      const render = () => {
        const info = store?.info(id());
        const url = store?.imageUrl(id());
        const description = current.attrs['alt'] as string;
        img.alt = description;
        if (url) img.src = url;
        img.hidden = !url;
        status.hidden = !!url;
        status.textContent =
          info?.missing === true
            ? `Image not found${description ? `: ${description}` : ''}`
            : 'Loading image…';
        dom.classList.toggle('note-image--missing', info?.missing === true);
        alt.hidden = !editor.isEditable;
        if (document.activeElement !== alt) alt.value = description;
      };

      // The description is saved as the image's alt text when the field is left or Enter.
      const commit = () => {
        const pos = getPos();
        if (typeof pos !== 'number' || alt.value === current.attrs['alt']) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: alt.value }),
        );
      };
      alt.addEventListener('blur', commit);
      alt.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          editor.commands.focus();
        }
      });

      store?.request(id(), { image: true });
      const unsubscribe = store?.subscribe(render);
      render();
      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          store?.request(id(), { image: true });
          render();
          return true;
        },
        destroy: () => unsubscribe?.(),
        // Typing in the description field is not editing the note's text.
        stopEvent: (event) => event.target === alt,
        ignoreMutation: () => true,
      };
    };
  },

  parseMarkdown: (token: MarkdownToken, h) => {
    const id = parseFileUrl(token['href'] as string | undefined);
    // An image on the web is never loaded: its description becomes text, which the lossless
    // check notices, so such notes stay in Markdown mode.
    if (!id) return h.createTextNode(token.text ?? '');
    return h.createNode('noteImage', { id, alt: token.text ?? '' });
  },

  renderMarkdown: (node: JSONContent) =>
    `![${escapeLinkLabel((node.attrs?.['alt'] as string | undefined) ?? '')}](${fileUrl(node.attrs?.['id'] as string)})`,
});

// ---------- Other files ----------

export const FileAttachment = Node.create<{ store: AttachmentStore | null }>({
  name: 'fileAttachment',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { store: null };
  },

  addAttributes() {
    return { id: { default: '' }, name: { default: '' } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-attachment]',
        getAttrs: (element) => ({
          id: element.getAttribute('data-attachment'),
          name: element.textContent,
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      { 'data-attachment': node.attrs['id'] as string, class: 'file-chip' },
      node.attrs['name'] as string,
    ];
  },

  renderText({ node }) {
    return node.attrs['name'] as string;
  },

  addNodeView() {
    const { store } = this.options;
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'file-chip';
      dom.contentEditable = 'false';
      const label = document.createElement('span');
      label.className = 'file-chip__name';
      const size = document.createElement('span');
      size.className = 'file-chip__size';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'file-chip__button';
      open.textContent = 'Open';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'file-chip__button';
      save.textContent = 'Save a copy';
      dom.append(label, size, open, save);

      const id = () => current.attrs['id'] as string;
      const render = () => {
        const info = store?.info(id());
        const name =
          (info && !info.missing ? info.name : (current.attrs['name'] as string)) || 'File';
        const missing = info?.missing === true;
        label.textContent = name;
        size.textContent = missing ? 'not found' : info ? formatSize(info.size) : '';
        dom.classList.toggle('file-chip--missing', missing);
        dom.setAttribute('aria-label', `File: ${name}${missing ? ' (not found)' : ''}`);
        // Files that run programs can be saved, never opened from a note.
        open.hidden = !store || missing || info?.executable === true;
        save.hidden = !store || missing;
        open.setAttribute('aria-label', `Open ${name}`);
        save.setAttribute('aria-label', `Save a copy of ${name}`);
      };
      for (const [button, action] of [
        [open, () => store?.open(id())],
        [save, () => store?.save(id())],
      ] as const) {
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', (event) => {
          event.preventDefault();
          action();
        });
      }

      store?.request(id());
      const unsubscribe = store?.subscribe(render);
      render();
      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          store?.request(id());
          render();
          return true;
        },
        destroy: () => unsubscribe?.(),
        stopEvent: (event) => event.target === open || event.target === save,
        ignoreMutation: () => true,
      };
    };
  },

  markdownTokenizer: {
    name: 'fileAttachment',
    level: 'inline',
    start: (src: string) => FILE_LINK_ANYWHERE.exec(src)?.index ?? -1,
    tokenize: (src) => {
      const match = FILE_LINK_AT_START.exec(src);
      if (!match) return undefined;
      return {
        type: 'fileAttachment',
        raw: match[0],
        name: unescapeLinkLabel(match[1] ?? ''),
        id: match[2],
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, h) =>
    h.createNode('fileAttachment', { id: token['id'] as string, name: token['name'] as string }),

  renderMarkdown: (node: JSONContent) =>
    `[${escapeLinkLabel((node.attrs?.['name'] as string | undefined) ?? '')}](${fileUrl(node.attrs?.['id'] as string)})`,
});

// ---------- Adding files: paste, drop, and the /image and /file commands ----------

/** Uploads files and inserts them at `pos` (images and file chips), in order. */
export async function insertFiles(
  editor: Editor,
  store: AttachmentStore,
  files: File[],
  pos: number,
) {
  let at = pos;
  for (const file of files) {
    const info = await store.upload(file);
    if (!info || editor.isDestroyed) continue;
    const content = [attachmentNode(info), { type: 'text', text: ' ' }];
    editor.chain().insertContentAt(at, content).run();
    at = Math.min(at + 2, editor.state.doc.content.size);
  }
}

const filesOf = (list: FileList | null | undefined) => (list ? [...list] : []);

type FileKind = 'image' | 'file';
interface PromptState {
  prompt: { pos: number; kind: FileKind } | null;
}

export const attachmentInputKey = new PluginKey<PromptState>('attachmentInput');

const PROMPT_TEXT: Record<FileKind, { choose: string; cancel: string }> = {
  image: { choose: 'Choose an image…', cancel: 'Cancel adding an image' },
  file: { choose: 'Choose a file…', cancel: 'Cancel adding a file' },
};

/**
 * Paste and drop add files; /image and /file show a prompt at the cursor whose "Choose" button
 * opens the system's file window. The window opens from a click rather than straight from the
 * Enter that ran the command: Windows' "Hide pointer while typing" hides the pointer on that
 * keystroke, and the file window would open with no pointer until it closed (reproduced on
 * Windows 11; moving the mouse to the button shows it again). Enter on the prompt still opens
 * the window, for keyboard users.
 */
export const AttachmentInput = Extension.create<{ store: AttachmentStore | null }>({
  name: 'attachmentInput',

  addOptions() {
    return { store: null };
  },

  addProseMirrorPlugins() {
    const { store } = this.options;
    const editor = this.editor;
    if (!store) return [];
    const accept = (view: EditorView) => view.editable;
    const close = (view: EditorView) =>
      view.dispatch(view.state.tr.setMeta(attachmentInputKey, null));
    const choose = (view: EditorView) => {
      const prompt = attachmentInputKey.getState(view.state)?.prompt;
      if (!prompt) return;
      close(view);
      void store.pick(prompt.kind).then((files) => insertFiles(editor, store, files, prompt.pos));
    };
    return [
      new Plugin<PromptState>({
        key: attachmentInputKey,
        state: {
          init: () => ({ prompt: null }),
          apply(tr, value) {
            const meta = tr.getMeta(attachmentInputKey) as PromptState['prompt'] | undefined;
            if (meta !== undefined) return { prompt: meta };
            if (!value.prompt) return value;
            // Any edit, or moving the cursor away, closes the prompt.
            const pos = tr.mapping.map(value.prompt.pos);
            if (tr.docChanged || (tr.selectionSet && tr.selection.from !== pos)) {
              return { prompt: null };
            }
            return { prompt: { ...value.prompt, pos } };
          },
        },
        props: {
          decorations(state) {
            const prompt = attachmentInputKey.getState(state)?.prompt;
            if (!prompt) return null;
            const widget = Decoration.widget(
              prompt.pos,
              (view) => {
                const text = PROMPT_TEXT[prompt.kind];
                const dom = document.createElement('span');
                dom.className = 'upload-prompt';
                dom.contentEditable = 'false';
                dom.setAttribute('role', 'group');
                dom.setAttribute(
                  'aria-label',
                  prompt.kind === 'image' ? 'Add an image' : 'Add a file',
                );
                const chooseButton = document.createElement('button');
                chooseButton.type = 'button';
                chooseButton.className = 'upload-prompt__choose';
                chooseButton.textContent = text.choose;
                const hint = document.createElement('span');
                hint.className = 'upload-prompt__hint';
                hint.textContent = 'or paste or drop one here';
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'upload-prompt__cancel';
                cancel.textContent = '×';
                cancel.setAttribute('aria-label', text.cancel);
                cancel.title = 'Cancel (Esc)';
                for (const [button, action] of [
                  [chooseButton, () => choose(view)],
                  [cancel, () => close(view)],
                ] as const) {
                  // Keep the cursor where the file will go.
                  button.addEventListener('mousedown', (event) => event.preventDefault());
                  button.addEventListener('click', action);
                }
                dom.append(chooseButton, hint, cancel);
                return dom;
              },
              {
                key: `upload-prompt-${prompt.kind}`,
                side: 1,
                ignoreSelection: true,
                stopEvent: () => true,
              },
            );
            return DecorationSet.create(state.doc, [widget]);
          },
          handleKeyDown(view, event) {
            if (!attachmentInputKey.getState(view.state)?.prompt) return false;
            if (event.key === 'Enter') {
              choose(view);
              return true;
            }
            if (event.key === 'Escape') {
              // It closes the prompt only, and does not also leave focus mode.
              event.stopPropagation();
              close(view);
              return true;
            }
            return false;
          },
          handlePaste: (view, event) => {
            const files = filesOf(event.clipboardData?.files);
            if (files.length === 0 || !accept(view)) return false;
            void insertFiles(editor, store, files, view.state.selection.from);
            return true;
          },
          handleDrop: (view, event) => {
            const files = filesOf(event.dataTransfer?.files);
            if (files.length === 0 || !accept(view)) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            void insertFiles(editor, store, files, at?.pos ?? view.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});

/** Runs a slash command that adds files: removes the typed "/query" and shows the prompt there. */
export function promptForFiles(editor: Editor, from: number, to: number, kind: FileKind) {
  editor.chain().focus().deleteRange({ from, to }).run();
  if (!attachmentInputKey.getState(editor.state)) return;
  editor.view.dispatch(editor.state.tr.setMeta(attachmentInputKey, { pos: from, kind }));
}
