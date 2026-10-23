import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { parseMarkdown } from '../editor/markdown';

/** The deepest heading level the outline lists. */
export const OUTLINE_DEPTH = 3;

/** One heading in a note's outline (ADR-0017). */
export interface OutlineEntry {
  level: number;
  text: string;
  /** Where the heading starts: a document position (visual) or a character offset (Markdown). */
  at: number;
}

const name = (text: string) => text.trim() || 'Untitled heading';

/** Headings 1–3 of the visual editor's document, in order. */
export function outlineFromDoc(doc: ProseMirrorNode): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const level = node.attrs['level'] as number;
    if (level <= OUTLINE_DEPTH) entries.push({ level, text: name(node.textContent), at: pos });
    return false;
  });
  return entries;
}

interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number } };
}

const textOf = (node: MarkdownNode): string =>
  typeof node.value === 'string' ? node.value : (node.children ?? []).map(textOf).join('');

/**
 * Headings 1–3 of Markdown text, in order, parsed the way the preview renders them (so a "#"
 * inside a code block is not a heading).
 */
export function outlineFromMarkdown(markdown: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const walk = (node: MarkdownNode) => {
    if (node.type === 'heading') {
      if ((node.depth ?? 0) <= OUTLINE_DEPTH) {
        entries.push({
          level: node.depth ?? 1,
          text: name(textOf(node)),
          at: node.position?.start.offset ?? 0,
        });
      }
      return;
    }
    node.children?.forEach(walk);
  };
  walk(parseMarkdown(markdown) as MarkdownNode);
  return entries;
}

/** The index of the entry that contains `at` (the last one starting at or before it), or -1. */
export function currentEntry(entries: OutlineEntry[], at: number): number {
  let index = -1;
  entries.forEach((entry, i) => {
    if (entry.at <= at) index = i;
  });
  return index;
}
