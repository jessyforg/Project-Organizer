import { Extension, mergeAttributes, Node, type Editor, type JSONContent } from '@tiptap/react';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextSelection } from '@tiptap/pm/state';
import type { MarkdownToken } from '@tiptap/core';

/**
 * Note blocks beyond plain Markdown (ADR-0017, stage 3): callouts, toggles, and tables. Each has
 * one exact Markdown form; anything written differently fails the lossless check (markdown.ts)
 * and the note opens in Markdown mode, unchanged.
 */

// ---------- Callouts: GitHub alert syntax, "> [!NOTE]" ----------

export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const CALLOUT_START = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/m;
/** The marker line, then every following line that starts with ">". */
const CALLOUT = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)((?:>.*(?:\n|$))*)/;

/** Renders blocks the way a quote does: each line after "> ", blank lines as ">". */
function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

const emptyParagraph: JSONContent = { type: 'paragraph' };

/**
 * Each child block's Markdown, without the newlines some blocks (tables) put around their own
 * output, and without empty blocks. Only newlines are trimmed: leading spaces can matter.
 */
function renderBlocks(
  children: JSONContent[],
  h: { renderChildren: (nodes: JSONContent[]) => string },
): string[] {
  return children
    .map((child) => h.renderChildren([child]).replace(/^\n+|\n+$/g, ''))
    .filter((text) => text.trim() !== '');
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-kind') ?? 'note',
        renderHTML: (attributes) => ({ 'data-kind': attributes['kind'] as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = CALLOUT_LABELS[node.attrs['kind'] as CalloutKind] ?? 'Note';
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        'data-label': label,
        class: 'callout',
        role: 'note',
        'aria-label': label,
      }),
      0,
    ];
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => CALLOUT_START.exec(src)?.index ?? -1,
    tokenize: (src, _tokens, lexer) => {
      const match = CALLOUT.exec(src);
      if (!match) return undefined;
      const inner = (match[2] ?? '')
        .split('\n')
        .map((line) => line.replace(/^> ?/, ''))
        .join('\n');
      return {
        type: 'callout',
        raw: match[0],
        kind: match[1]!.toLowerCase(),
        tokens: lexer.blockTokens(inner),
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, h) => {
    const parse = h.parseBlockChildren ?? h.parseChildren;
    const content = parse(token.tokens ?? []);
    return h.createNode(
      'callout',
      { kind: token['kind'] as string },
      content.length ? content : [emptyParagraph],
    );
  },

  renderMarkdown: (node: JSONContent, h) => {
    const marker = `> [!${String(node.attrs?.['kind'] ?? 'note').toUpperCase()}]`;
    const body = renderBlocks(node.content ?? [], h)
      .map(quoteLines)
      .join('\n>\n');
    return body ? `${marker}\n${body}` : marker;
  },
});

// ---------- Toggles: <details> and <summary>, in one exact layout ----------

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const DETAILS_OPEN = /^<details( open)?>$/;
const SUMMARY = /^<summary>(.*)<\/summary>$/;

/**
 * Finds a toggle at the start of `src`, written exactly as renderMarkdown writes it:
 * "<details>" (or "<details open>"), "<summary>…</summary>", a blank line, the body, a blank
 * line, "</details>". Nested toggles are matched by counting.
 */
export function matchToggle(
  src: string,
): { raw: string; open: boolean; summary: string; body: string } | null {
  const lines = src.split('\n');
  const opening = DETAILS_OPEN.exec(lines[0] ?? '');
  const summary = SUMMARY.exec(lines[1] ?? '');
  if (!opening || !summary || lines[2] !== '') return null;
  let depth = 1;
  for (let i = 3; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (DETAILS_OPEN.test(line)) depth += 1;
    else if (line === '</details>') depth -= 1;
    if (depth > 0) continue;
    if (lines[i - 1] !== '') return null;
    const raw = lines.slice(0, i + 1).join('\n') + (i + 1 < lines.length ? '\n' : '');
    return {
      raw,
      open: opening[1] !== undefined,
      summary: unescapeHtml(summary[1] ?? ''),
      body: lines.slice(3, i - 1).join('\n'),
    };
  }
  return null;
}

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'text*',
  marks: '',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-toggle-summary]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toggle-summary': '', class: 'toggle__summary' }),
      0,
    ];
  },
});

/** Opens or closes the toggle at `pos`. */
function setToggleOpen(editor: Editor, pos: number, open: boolean) {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== 'toggle') return;
  let tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open });
  // A closed toggle hides its body, so a cursor inside it moves to the end of the summary.
  const { from } = tr.selection;
  const summaryEnd = pos + 1 + node.child(0).nodeSize - 1;
  if (!open && from > summaryEnd && from < pos + node.nodeSize) {
    tr = tr.setSelection(TextSelection.create(tr.doc, summaryEnd));
  }
  editor.view.dispatch(tr);
}

/** The toggle around the cursor, if the cursor is in its summary. */
function summaryAtCursor(editor: Editor): { pos: number; open: boolean } | null {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name !== 'toggleSummary' || $from.depth < 2) return null;
  const toggle = $from.node($from.depth - 1);
  return { pos: $from.before($from.depth - 1), open: toggle.attrs['open'] === true };
}

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary block+',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute('data-open'),
        renderHTML: (attributes) => (attributes['open'] ? { 'data-open': '' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle': '', class: 'toggle' }), 0];
  },

  /** A button to open and close the toggle beside its editable content. */
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement('div');
      dom.className = 'toggle';
      dom.setAttribute('data-toggle', '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toggle__button';
      button.contentEditable = 'false';
      const content = document.createElement('div');
      content.className = 'toggle__content';
      dom.append(button, content);

      const sync = () => {
        const open = current.attrs['open'] === true;
        dom.toggleAttribute('data-open', open);
        button.setAttribute('aria-expanded', String(open));
        const summary = current.child(0).textContent.trim() || 'toggle';
        button.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${summary}`);
      };
      sync();
      // Keep the editor's selection where it is when the button is pressed.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos === 'number' && editor.isEditable) {
          setToggleOpen(editor, pos, current.attrs['open'] !== true);
        }
      });

      return {
        dom,
        contentDOM: content,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          sync();
          return true;
        },
        // The button is not part of the document; ProseMirror should ignore events on it.
        stopEvent: (event) => button.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) =>
          mutation.target === button ||
          button.contains(mutation.target) ||
          (mutation.type === 'attributes' && mutation.target === dom),
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      // In a summary, Enter moves into the body (opening the toggle).
      Enter: ({ editor }) => {
        const at = summaryAtCursor(editor);
        if (!at) return false;
        if (!at.open) setToggleOpen(editor, at.pos, true);
        const toggle = editor.state.doc.nodeAt(at.pos)!;
        const bodyStart = at.pos + 1 + toggle.child(0).nodeSize + 1;
        editor.commands.setTextSelection(bodyStart);
        return true;
      },
      // In a summary, Ctrl+Enter opens or closes the toggle.
      'Mod-Enter': ({ editor }) => {
        const at = summaryAtCursor(editor);
        if (!at) return false;
        setToggleOpen(editor, at.pos, !at.open);
        return true;
      },
    };
  },

  markdownTokenizer: {
    name: 'toggle',
    level: 'block',
    start: (src: string) => /^<details( open)?>$/m.exec(src)?.index ?? -1,
    tokenize: (src, _tokens, lexer) => {
      const match = matchToggle(src);
      if (!match) return undefined;
      return {
        type: 'toggle',
        raw: match.raw,
        open: match.open,
        summary: match.summary,
        tokens: lexer.blockTokens(match.body),
      };
    },
  },

  parseMarkdown: (token: MarkdownToken, h) => {
    const parse = h.parseBlockChildren ?? h.parseChildren;
    const body = parse(token.tokens ?? []);
    const summary = token['summary'] as string;
    return h.createNode('toggle', { open: token['open'] === true }, [
      h.createNode('toggleSummary', {}, summary ? [h.createTextNode(summary)] : []),
      ...(body.length ? body : [emptyParagraph]),
    ]);
  },

  renderMarkdown: (node: JSONContent, h) => {
    const [summary, ...body] = node.content ?? [];
    const title = escapeHtml((summary?.content ?? []).map((t) => t.text ?? '').join(''));
    const open = node.attrs?.['open'] === true ? ' open' : '';
    const content = renderBlocks(body, h).join('\n\n');
    return `<details${open}>\n<summary>${title}</summary>\n\n${content}\n\n</details>`;
  },
});

// ---------- Tables: GitHub tables, one line of text per cell ----------

/**
 * Markdown table cells hold one line of inline text, so cells here hold exactly one paragraph:
 * a list or a second paragraph in a cell could not be saved without changing its meaning.
 * Alignment is a data attribute styled by editor.css; the extension's inline styles would be
 * blocked by the Content Security Policy.
 */
const cellAttributes = {
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-align'),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes['align'] ? { 'data-align': attributes['align'] as string } : {},
  },
};

export const NoteTableCell = TableCell.extend({
  content: 'paragraph',
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

export const NoteTableHeader = TableHeader.extend({
  content: 'paragraph',
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

export const NoteTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'table-wrapper' },
      ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['tbody', 0]],
    ];
  },
}).configure({ resizable: false });

/** Inside a table cell, line breaks are refused: a Markdown cell is one line. */
const OneLineCells = Extension.create({
  name: 'oneLineCells',
  addKeyboardShortcuts() {
    const inCell = () => this.editor.isActive('tableCell') || this.editor.isActive('tableHeader');
    return {
      'Shift-Enter': inCell,
      'Mod-Enter': inCell,
      Enter: inCell,
    };
  },
});

export function noteBlockExtensions() {
  return [
    Callout,
    ToggleSummary,
    Toggle,
    NoteTable,
    TableRow,
    NoteTableHeader,
    NoteTableCell,
    OneLineCells,
  ];
}
