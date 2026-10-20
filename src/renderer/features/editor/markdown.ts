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
    const text = manager.serialize(content).trimEnd();
    return text === '' ? '' : `${text}\n`;
  };

  const fromMarkdown = (markdown: string): VisualResult => {
    if (markdown.trim() === '') return { ok: true, content: { type: 'doc', content: [] } };
    try {
      // nodeFromJSON and check() reject anything the editor's schema cannot hold.
      const doc = schema.nodeFromJSON(manager.parse(markdown));
      doc.check();
      const content = doc.toJSON() as JSONContent;
      return sameMarkdown(markdown, toMarkdown(content)) ? { ok: true, content } : { ok: false };
    } catch {
      return { ok: false };
    }
  };

  return { fromMarkdown, toMarkdown };
}

const parser = unified().use(remarkParse).use(remarkGfm);

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
