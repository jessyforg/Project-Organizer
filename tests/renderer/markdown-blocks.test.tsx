import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteMarkdown } from '../../src/renderer/features/notes/NoteMarkdown';
import { installApi, renderWithApp } from './harness';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec, sameMarkdown } from '../../src/renderer/features/editor/markdown';

const codec = createMarkdownCodec(noteExtensions());

/** Opens Markdown in the visual editor's model and writes it back. */
function roundTrip(markdown: string) {
  const opened = codec.fromMarkdown(markdown);
  if (!opened.ok) throw new Error('Opened in Markdown mode');
  return { content: opened.content, markdown: codec.toMarkdown(opened.content) };
}

const types = (markdown: string) => roundTrip(markdown).content.content?.map((n) => n.type);

describe('callouts (ADR-0017 stage 3)', () => {
  it.each(['NOTE', 'TIP', 'WARNING', 'IMPORTANT', 'CAUTION'])(
    'reads and writes > [!%s] unchanged',
    (kind) => {
      const md = `> [!${kind}]\n> Remember **this**\n`;
      const { content, markdown } = roundTrip(md);
      expect(content.content?.[0]).toMatchObject({
        type: 'callout',
        attrs: { kind: kind.toLowerCase() },
        content: [{ type: 'paragraph' }],
      });
      expect(markdown).toBe(md);
    },
  );

  it('keeps several blocks inside a callout', () => {
    const md = '> [!TIP]\n> First\n>\n> - one\n> - two\n';
    const { content, markdown } = roundTrip(md);
    expect(content.content?.[0]?.content?.map((n) => n.type)).toEqual(['paragraph', 'bulletList']);
    expect(sameMarkdown(markdown, md)).toBe(true);
  });

  it('leaves a quote that only looks like a callout as a quote', () => {
    expect(types('> [!NOTE] With a title\n> Body\n')).toEqual(['blockquote']);
    expect(types('> [!UNKNOWN]\n> Body\n')).toEqual(['blockquote']);
  });
});

describe('toggles', () => {
  it('reads and writes a closed toggle unchanged', () => {
    const md = '<details>\n<summary>More</summary>\n\nHidden **text**\n\n</details>\n';
    const { content, markdown } = roundTrip(md);
    expect(content.content?.[0]).toMatchObject({
      type: 'toggle',
      attrs: { open: false },
      content: [
        { type: 'toggleSummary', content: [{ type: 'text', text: 'More' }] },
        { type: 'paragraph' },
      ],
    });
    expect(markdown).toBe(md);
  });

  it('remembers an open toggle and escapes its summary', () => {
    const md = '<details open>\n<summary>a &lt; b &amp; c</summary>\n\nBody\n\n</details>\n';
    const { content, markdown } = roundTrip(md);
    expect(content.content?.[0]?.attrs).toEqual({ open: true });
    expect(content.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('a < b & c');
    expect(markdown).toBe(md);
  });

  it('allows toggles inside toggles and other blocks inside them', () => {
    const md =
      '<details>\n<summary>Outer</summary>\n\n# Heading\n\n<details>\n<summary>Inner</summary>\n\nDeep\n\n</details>\n\n</details>\n';
    const { content, markdown } = roundTrip(md);
    expect(content.content?.[0]?.content?.map((n) => n.type)).toEqual([
      'toggleSummary',
      'heading',
      'toggle',
    ]);
    expect(markdown).toBe(md);
  });

  it('opens other HTML, including toggles written differently, in Markdown mode', () => {
    expect(codec.fromMarkdown('<details><summary>One line</summary>Body</details>\n').ok).toBe(
      false,
    );
    expect(codec.fromMarkdown('<div>Raw</div>\n').ok).toBe(false);
  });
});

describe('tables', () => {
  // In GitHub tables a "|" inside code must be escaped, or it splits the cell.
  const md = '| Name | Qty |\n| --- | :-: |\n| Apple | 2 |\n| Pear `a\\|b` | 10 |\n';

  it('opens GitHub tables in the visual editor without losing anything', () => {
    const { content, markdown } = roundTrip(md);
    const table = content.content?.[0];
    expect(table?.type).toBe('table');
    expect(table?.content?.map((row) => row.content?.map((cell) => cell.type))).toEqual([
      ['tableHeader', 'tableHeader'],
      ['tableCell', 'tableCell'],
      ['tableCell', 'tableCell'],
    ]);
    expect(sameMarkdown(markdown, md)).toBe(true);
  });

  it('writes the same text when opened again (stable)', () => {
    const once = roundTrip(md).markdown;
    expect(roundTrip(once).markdown).toBe(once);
  });

  it('opens a table in Markdown mode when the editor would read it differently', () => {
    // An unescaped "|" in code: GitHub (and the preview) split the cell there; the table
    // extension would not. The lossless check notices, so nothing is changed.
    expect(codec.fromMarkdown('| A | B |\n| --- | --- |\n| `a|b` | 2 |\n').ok).toBe(false);
  });

  it('does not start the saved text with a blank line when the note starts with a table', () => {
    expect(roundTrip(md).markdown.startsWith('|')).toBe(true);
  });

  it('keeps notes with tables and other text together', () => {
    expect(types(`# Stock\n\n${md}\nAfter the table\n`)).toEqual(['heading', 'table', 'paragraph']);
  });
});

describe('Markdown preview of the new blocks', () => {
  it('shows callouts as labelled notes without the marker', () => {
    installApi();
    renderWithApp(<NoteMarkdown text={'> [!WARNING]\n> Back up **first**\n'} />);
    const callout = screen.getByRole('note', { name: 'Warning' });
    expect(callout).toHaveTextContent(/^Warning\s*Back up first$/);
    expect(callout).not.toHaveTextContent('[!WARNING]');
  });

  it('shows toggles as details elements, open when saved open, nested too', () => {
    installApi();
    const { container } = renderWithApp(
      <NoteMarkdown
        text={
          '<details open>\n<summary>a &lt; b</summary>\n\nOuter\n\n<details>\n<summary>Inner</summary>\n\nDeep\n\n</details>\n\n</details>\n'
        }
      />,
    );
    const [outer, inner] = Array.from(container.querySelectorAll('details'));
    expect(outer).toHaveAttribute('open');
    expect(outer!.querySelector('summary')).toHaveTextContent('a < b');
    expect(inner).not.toHaveAttribute('open');
    expect(inner!.querySelector('summary')).toHaveTextContent('Inner');
    expect(container).not.toHaveTextContent('<details');
  });

  it('still never renders other HTML', () => {
    installApi();
    const { container } = renderWithApp(
      <NoteMarkdown text={'<details><summary>x</summary>y</details>\n\n<b>bold</b>\n'} />,
    );
    expect(container.querySelector('details, b')).toBeNull();
  });
});
