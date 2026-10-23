import { Extension, Node, type Editor, type JSONContent, type Range } from '@tiptap/react';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import type { MarkdownToken } from '@tiptap/core';
import {
  APP_LINK_MARKDOWN,
  appLinkMarkdown,
  unescapeLinkLabel,
  type AppLinkKind,
  type AppLinkTarget,
} from '@shared/app-links';
import type { AppLinkInfo } from '@shared/domain';
import { describeLink } from './link-display';
import { menuRender, type SuggestionMenuOptions } from './suggestion-types';

/**
 * Links from a note to other notes (stage 4) and to tasks and projects (stage 5), ADR-0017.
 * In Markdown they are `[Label](projectforge://kind/id)`; in the editor, a chip that shows the
 * item's current title, or that the item is missing.
 */

/** What links need from the app: current titles, opening, and the pickers' searches. */
export interface LinkResolver {
  /** The item's current state; undefined until it has been looked up. */
  info: (target: AppLinkTarget) => AppLinkInfo | undefined;
  /** Asks for the item to be looked up (batched). */
  request: (target: AppLinkTarget) => void;
  subscribe: (listener: () => void) => () => void;
  /** Changes whenever looked-up items change (for useSyncExternalStore). */
  version: () => number;
  open: (target: AppLinkTarget, options: { focus: boolean }) => void;
  /** Notes for the [[ picker, best matches first. */
  searchNotes: (query: string) => Promise<AppLinkInfo[]>;
  /** Tasks and projects for the @ picker, best matches first (stage 5). */
  searchMentions: (query: string) => Promise<AppLinkInfo[]>;
  /** Creates a note with this title, for "Create note …" in the picker. */
  createNote: (title: string) => Promise<AppLinkInfo | null>;
}

export function appLinkNode(info: Pick<AppLinkInfo, 'kind' | 'id' | 'label'>): JSONContent {
  return { type: 'appLink', attrs: { kind: info.kind, id: info.id, label: info.label } };
}

const LINK_AT_START = new RegExp(`^${APP_LINK_MARKDOWN.source}`);
const LINK_ANYWHERE = new RegExp(`\\[(?:\\\\.|[^\\]\\\\\\n])*\\]\\(projectforge://`);

export const AppLink = Node.create<{ resolver: LinkResolver | null }>({
  name: 'appLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { resolver: null };
  },

  addAttributes() {
    return {
      kind: { default: 'note' },
      id: { default: '' },
      /** The title when the link was made; shown only if the item cannot be looked up. */
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-app-link]',
        getAttrs: (element) => ({
          kind: element.getAttribute('data-kind'),
          id: element.getAttribute('data-id'),
          label: element.textContent,
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        'data-app-link': '',
        'data-kind': node.attrs['kind'] as string,
        'data-id': node.attrs['id'] as string,
        class: 'app-link',
      },
      node.attrs['label'] as string,
    ];
  },

  renderText({ node }) {
    return node.attrs['label'] as string;
  },

  addNodeView() {
    const { resolver } = this.options;
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'app-link';
      dom.setAttribute('data-app-link', '');
      dom.setAttribute('role', 'link');
      const target = (): AppLinkTarget => ({
        kind: current.attrs['kind'] as AppLinkKind,
        id: current.attrs['id'] as string,
      });

      const render = () => {
        const { kind } = target();
        const shown = describeLink(
          kind,
          resolver?.info(target()),
          current.attrs['label'] as string,
        );
        // Tasks show a status dot before the title and their due date after it.
        const parts: globalThis.Node[] = [];
        if (shown.category) {
          const dot = document.createElement('span');
          dot.className = 'app-link__status';
          dot.setAttribute('data-category', shown.category);
          parts.push(dot);
        }
        parts.push(document.createTextNode(shown.label));
        if (shown.due) {
          const due = document.createElement('span');
          due.className = 'app-link__due';
          due.textContent = shown.due;
          parts.push(due);
        }
        dom.replaceChildren(...parts);
        dom.setAttribute('data-kind', kind);
        dom.classList.toggle('app-link--missing', shown.missing);
        dom.classList.toggle('app-link--archived', shown.archived);
        dom.setAttribute('aria-disabled', String(shown.missing));
        dom.setAttribute('aria-label', shown.spoken);
        dom.title = shown.hint;
      };

      resolver?.request(target());
      const unsubscribe = resolver?.subscribe(render);
      render();
      dom.addEventListener('click', (event) => {
        if (!resolver || resolver.info(target())?.missing) return;
        event.preventDefault();
        resolver.open(target(), { focus: event.ctrlKey || event.metaKey });
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          resolver?.request(target());
          render();
          return true;
        },
        destroy: () => unsubscribe?.(),
        ignoreMutation: () => true,
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter on a selected link opens it.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const resolver = this.options.resolver;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'appLink') {
          return false;
        }
        if (!resolver) return false;
        const target = {
          kind: selection.node.attrs['kind'] as AppLinkKind,
          id: selection.node.attrs['id'] as string,
        };
        if (!resolver.info(target)?.missing) resolver.open(target, { focus: false });
        return true;
      },
    };
  },

  markdownTokenizer: {
    name: 'appLink',
    level: 'inline',
    start: (src: string) => LINK_ANYWHERE.exec(src)?.index ?? -1,
    tokenize: (src) => {
      const match = LINK_AT_START.exec(src);
      if (!match) return undefined;
      return {
        type: 'appLink',
        raw: match[0],
        label: unescapeLinkLabel(match[1] ?? ''),
        kind: match[2],
        id: match[3],
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, h) =>
    h.createNode('appLink', {
      kind: token['kind'] as string,
      id: token['id'] as string,
      label: token['label'] as string,
    }),

  renderMarkdown: (node: JSONContent) =>
    appLinkMarkdown(
      { kind: node.attrs?.['kind'] as AppLinkKind, id: node.attrs?.['id'] as string },
      (node.attrs?.['label'] as string | undefined) ?? '',
    ),
});

// ---------- The [[ picker ----------

/** A note to link to, or a new note to create with the typed title. */
export type NotePickerItem = AppLinkInfo | { create: string };

function insertLink(editor: Editor, range: Range, info: AppLinkInfo) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [appLinkNode(info), { type: 'text', text: ' ' }])
    .run();
}

export const noteLinkPickerKey = new PluginKey('noteLinkPicker');

/** Typing "[[" opens a list of notes to link to, filtered as you type (ADR-0017). */
export const NoteLinkPicker = Extension.create<
  SuggestionMenuOptions<NotePickerItem> & { resolver: LinkResolver | null }
>({
  name: 'noteLinkPicker',

  addOptions() {
    return { onState: () => {}, onKeyDown: () => false, resolver: null };
  },

  addProseMirrorPlugins() {
    const { resolver } = this.options;
    if (!resolver) return [];
    return [
      Suggestion<NotePickerItem, NotePickerItem>({
        editor: this.editor,
        pluginKey: noteLinkPickerKey,
        char: '[[',
        allowSpaces: true,
        decorationClass: 'slash-query',
        allow: ({ editor, state, range }) =>
          editor.isEditable && !state.doc.resolve(range.from).parent.type.spec.code,
        items: async ({ query }) => {
          const notes = await resolver.searchNotes(query);
          const title = query.trim();
          const exact = notes.some((n) => n.label.toLowerCase() === title.toLowerCase());
          return title && !exact ? [...notes, { create: title }] : notes;
        },
        command: ({ editor, range, props }) => {
          if (!('create' in props)) return insertLink(editor, range, props);
          // Remove the typed "[[title" now; the link goes there once the note exists.
          editor.chain().focus().deleteRange(range).run();
          const at = range.from;
          void resolver.createNote(props.create).then((created) => {
            if (created && !editor.isDestroyed) insertLink(editor, { from: at, to: at }, created);
          });
        },
        render: menuRender(this.options),
      }),
    ];
  },
});

// ---------- The @ picker (stage 5) ----------

export const mentionPickerKey = new PluginKey('mentionPicker');

/** Typing "@" opens a list of tasks and projects to mention, filtered as you type (ADR-0017). */
export const MentionPicker = Extension.create<
  SuggestionMenuOptions<AppLinkInfo> & { resolver: LinkResolver | null }
>({
  name: 'mentionPicker',

  addOptions() {
    return { onState: () => {}, onKeyDown: () => false, resolver: null };
  },

  addProseMirrorPlugins() {
    const { resolver } = this.options;
    if (!resolver) return [];
    return [
      Suggestion<AppLinkInfo, AppLinkInfo>({
        editor: this.editor,
        pluginKey: mentionPickerKey,
        char: '@',
        allowSpaces: true,
        decorationClass: 'slash-query',
        allow: ({ editor, state, range }) =>
          editor.isEditable && !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => resolver.searchMentions(query),
        command: ({ editor, range, props }) => insertLink(editor, range, props),
        render: menuRender(this.options),
      }),
    ];
  },
});
