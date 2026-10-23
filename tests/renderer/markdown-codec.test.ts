import { describe, expect, it } from 'vitest';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec, sameMarkdown } from '../../src/renderer/features/editor/markdown';

const codec = createMarkdownCodec(noteExtensions());

/** Converts Markdown to the editor's document and back. */
function roundTrip(markdown: string): string {
  const result = codec.fromMarkdown(markdown);
  if (!result.ok) throw new Error('expected the note to open in the visual editor');
  return codec.toMarkdown(result.content);
}

describe('Markdown codec (ADR-0013)', () => {
  it.each([
    ['headings', '# One\n\n## Two\n\n###### Six\n'],
    [
      'bold, italic, strikethrough, and inline code',
      'Some **bold**, *italic*, ~~gone~~, `code`.\n',
    ],
    ['nested bulleted and numbered lists', '- a\n- b\n  - nested\n\n1. one\n2. two\n'],
    ['quotes and dividers', '> quoted\n\n---\n\nafter\n'],
    ['code blocks with a language and indentation', '```ts\nconst x = 1;\n  indented();\n```\n'],
    ['task lists', '- [ ] todo\n- [x] done\n'],
    ['web and mail links', '[site](https://example.com) and [mail](mailto:a@example.com)\n'],
    ['links the app will not open (the editor shows them inert)', '[local](file:///C:/x.txt)\n'],
    ['hard line breaks', 'line one  \nline two\n'],
    ['escaped characters', 'Use \\*stars\\* and snake\\_case\n'],
  ])('keeps %s', (_name, markdown) => {
    expect(sameMarkdown(markdown, roundTrip(markdown))).toBe(true);
  });

  it('accepts other spellings of the same Markdown', () => {
    expect(sameMarkdown('* a\n* b\n\n__bold__\n', roundTrip('* a\n* b\n\n__bold__\n'))).toBe(true);
  });

  it.each([
    ['a table with an unescaped pipe in code', '| a | b |\n|---|---|\n| `1|2` | 3 |\n'],
    ['images', '![diagram](https://example.com/d.png)\n'],
    ['raw HTML', 'Hello <b>raw</b>\n'],
    ['reference-style links', '[text][1]\n\n[1]: https://example.com\n'],
  ])('refuses notes with %s, so they stay in Markdown mode', (_name, markdown) => {
    expect(codec.fromMarkdown(markdown).ok).toBe(false);
  });

  it('opens an empty note as an empty document', () => {
    expect(codec.fromMarkdown('')).toEqual({ ok: true, content: { type: 'doc', content: [] } });
    expect(codec.toMarkdown({ type: 'doc', content: [] })).toBe('');
  });

  it('escapes typed Markdown characters so they stay literal', () => {
    const typed = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'I typed *stars* and _x_' }] },
      ],
    };
    const markdown = codec.toMarkdown(typed);
    expect(markdown).toBe('I typed \\*stars\\* and \\_x\\_\n');
    expect(sameMarkdown(markdown, 'I typed \\*stars\\* and \\_x\\_')).toBe(true);
  });

  it('does not store the empty paragraph the editor keeps at the end', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Done' }] },
        { type: 'paragraph' },
      ],
    };
    expect(codec.toMarkdown(doc)).toBe('Done\n');
  });

  it('treats different content as different', () => {
    expect(sameMarkdown('**a**', '*a*')).toBe(false);
    expect(sameMarkdown('- a\n- b', '- a\n- c')).toBe(false);
  });
});
