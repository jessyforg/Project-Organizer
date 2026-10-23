import { getSchema, type Extensions, type JSONContent } from '@tiptap/react';
import { MarkdownManager } from '@tiptap/markdown';
import type { Schema } from '@tiptap/pm/model';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * Converts between stored Markdown and the visual editor's document (ADR-0013).
 *
 * Markdown stays the stored format. Before a note opens in the visual editor, `fromMarkdown`
 * proves the round trip loses nothing: it parses the text, converts it back, and compares the
 * two as Markdown syntax trees (the same parser the preview uses), ignoring only spelling
 * differences such as `*` versus `-` bullets. If anything would change, such as a table the
 * editor cannot show, the note stays in Markdown mode and its text is never rewritten.
 */
export interface MarkdownCodec {
  fromMarkdown: (markdown: string) => VisualResult;
  toMarkdown: (content: JSONContent) => string;
}

export type VisualResult = { ok: true; content: JSONContent } | { ok: false };

export function createMarkdownCodec(extensions: Extensions): MarkdownCodec {
  const schema: Schema = getSchema(extensions);
  const manager = new MarkdownManager({ extensions });

  const toMarkdown = (content: JSONContent): string => {
    // Trailing blank lines come from the empty paragraph the editor keeps at the end so there is
    // always somewhere to type; the editor adds it back when the note opens.
    // Leading newlines come from blocks such as tables that start their output with one. (Only
    // newlines: leading spaces can matter, as in an indented code block.)
    const text = manager.serialize(content).trimEnd().replace(/^\n+/, '');
    return text === '' ? '' : `${text}\n`;
  };

  const fromMarkdown = (markdown: string): VisualResult => {
    if (markdown.trim() === '') return { ok: true, content: { type: 'doc', content: [] } };
    try {
      // nodeFromJSON and check() reject anything the editor's schema cannot hold.
      const doc = schema.nodeFromJSON(wrapLooseInline(schema, manager.parse(markdown)));
      doc.check();
      const content = doc.toJSON() as JSONContent;
      return sameMarkdown(markdown, toMarkdown(content)) ? { ok: true, content } : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  return { fromMarkdown, toMarkdown };
}

/**
 * Puts inline content that stands where blocks belong into paragraphs. The Markdown parser lifts
 * an image that is alone on its line out of its paragraph (Tiptap's own images are blocks);
 * images in notes are inline (ADR-0017), so they go back into one. Driven by the schema, so it
 * covers any container: the document, quotes, list items, callouts, and toggles.
 */
function wrapLooseInline(schema: Schema, node: JSONContent): JSONContent {
  if (!node.content) return node;
  const type = node.type ? schema.nodes[node.type] : undefined;
  const children = node.content.map((child) => wrapLooseInline(schema, child));
  if (!type || type.inlineContent || type.isAtom) return { ...node, content: children };
  const isInline = (child: JSONContent) =>
    child.type === 'text' || schema.nodes[child.type ?? '']?.isInline === true;
  const content: JSONContent[] = [];
  // Loose inline pieces next to each other share one new paragraph; they never join a paragraph
  // that was in the Markdown, which would change the text.
  let wrapper: JSONContent | null = null;
  for (const child of children) {
    if (!isInline(child)) {
      content.push(child);
      wrapper = null;
    } else if (wrapper) {
      wrapper.content!.push(child);
    } else {
      wrapper = { type: 'paragraph', content: [child] };
      content.push(wrapper);
    }
  }
  return { ...node, content };
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** The Markdown syntax tree (mdast), as the preview and the round-trip check read it. */
export function parseMarkdown(markdown: string) {
  return parser.parse(markdown);
}

/** Whether two Markdown texts mean the same thing. */
export function sameMarkdown(a: string, b: string): boolean {
  return JSON.stringify(normalize(parser.parse(a))) === JSON.stringify(normalize(parser.parse(b)));
}

/**
 * Drops what only records how the Markdown was spelled: source positions, and whether a list is
 * "loose" (blank lines between items), which changes spacing but not content.
 */
function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (node === null || typeof node !== 'object') return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'position' || key === 'spread') continue;
    result[key] = normalize(value);
  }
  return result;
}
