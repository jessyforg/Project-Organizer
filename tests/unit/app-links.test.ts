import { describe, expect, it } from 'vitest';
import {
  appLinkMarkdown,
  extractAppLinks,
  findPlainMention,
  parseAppLinkUrl,
  snippetAround,
} from '../../src/shared/app-links';

const A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const B = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

describe('app link addresses', () => {
  it('parse only well-formed note, task, and project addresses', () => {
    expect(parseAppLinkUrl(`projectforge://note/${A}`)).toEqual({ kind: 'note', id: A });
    expect(parseAppLinkUrl(`projectforge://task/${A}`)).toEqual({ kind: 'task', id: A });
    expect(parseAppLinkUrl(`projectforge://folder/${A}`)).toBeNull();
    expect(parseAppLinkUrl('projectforge://note/../../etc')).toBeNull();
    expect(parseAppLinkUrl(`https://example.com/${A}`)).toBeNull();
  });

  it('escape brackets in labels', () => {
    expect(appLinkMarkdown({ kind: 'note', id: A }, 'Plan [v2]')).toBe(
      `[Plan \\[v2\\]](projectforge://note/${A})`,
    );
  });
});

describe('extractAppLinks', () => {
  it('finds each linked item once, in order, including escaped labels', () => {
    const md = `See [One](projectforge://note/${A}) and [Two \\[x\\]](projectforge://task/${B}).\n\nAgain [One](projectforge://note/${A}).`;
    expect(extractAppLinks(md)).toEqual([
      { kind: 'note', id: A },
      { kind: 'task', id: B },
    ]);
  });

  it('ignores links inside code', () => {
    const md = `\`[One](projectforge://note/${A})\`\n\n\`\`\`\n[Two](projectforge://note/${B})\n\`\`\`\n`;
    expect(extractAppLinks(md)).toEqual([]);
  });

  it('ignores web links and malformed app addresses', () => {
    expect(extractAppLinks('[Web](https://example.com) [Bad](projectforge://note/123)')).toEqual(
      [],
    );
  });
});

describe('findPlainMention', () => {
  it('finds a whole-word, case-insensitive mention in prose', () => {
    const md = 'We discussed the launch plan today.';
    const at = findPlainMention(md, 'Launch Plan');
    expect(at).toEqual([md.indexOf('launch'), md.indexOf('launch') + 'launch plan'.length]);
  });

  it('skips parts of words, code, links, and web addresses', () => {
    expect(findPlainMention('Replanning', 'plan')).toBeNull();
    expect(findPlainMention('`plan`', 'plan')).toBeNull();
    expect(findPlainMention(`[plan](projectforge://note/${A})`, 'plan')).toBeNull();
    expect(findPlainMention('[docs](https://example.com/plan)', 'plan')).toBeNull();
    expect(findPlainMention('https://example.com/plan', 'plan')).toBeNull();
    expect(findPlainMention('<plan>', 'plan')).toBeNull();
    expect(findPlainMention('A plan, finally', 'plan')).toEqual([2, 6]);
  });
});

describe('snippetAround', () => {
  it('shows plain text around a position, with link labels', () => {
    const md = `# Notes\n\nBefore **bold** [Target](projectforge://note/${A}) after.`;
    expect(snippetAround(md, md.indexOf('[Target'), 30)).toBe('Notes Before bold Target after.');
  });

  it('marks cut text with an ellipsis and never cuts a link in half', () => {
    const md = `${'word '.repeat(40)}[Target](projectforge://note/${A}) ${'tail '.repeat(40)}`;
    const snippet = snippetAround(md, md.indexOf('[Target'), 20);
    expect(snippet).toMatch(/^….*Target.*…$/);
    expect(snippet).not.toContain('projectforge');
  });
});
