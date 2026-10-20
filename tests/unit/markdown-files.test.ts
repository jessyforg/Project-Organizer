import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeNoteMarkdown } from '../../src/main/notes/markdown-files';
import {
  importProblem,
  markdownFileName,
  noteFromMarkdownFile,
  noteToMarkdownFile,
} from '../../src/shared/markdown-file';
import { LIMITS } from '../../src/shared/schemas';
import { tempDir } from './helpers';

describe('Markdown files (shared)', () => {
  it('writes the title as a level-1 heading, then the body', () => {
    expect(noteToMarkdownFile('Plan', 'Ship it.\n')).toBe('# Plan\n\nShip it.\n');
    expect(noteToMarkdownFile('Empty', '')).toBe('# Empty\n');
  });

  it('reads the title from a leading level-1 heading', () => {
    expect(
      noteFromMarkdownFile('ignored.md', String.fromCharCode(0xfeff) + '\n# Plan\n\nShip it.\n'),
    ).toEqual({
      title: 'Plan',
      body: 'Ship it.\n',
    });
  });

  it('round-trips with export', () => {
    const text = noteToMarkdownFile('Release notes', '## Added\n\n- Folders\n');
    expect(noteFromMarkdownFile('x.md', text)).toEqual({
      title: 'Release notes',
      body: '## Added\n\n- Folders\n',
    });
  });

  it('otherwise uses the file name and keeps the whole text', () => {
    expect(noteFromMarkdownFile('Meeting notes.md', '## Agenda\n')).toEqual({
      title: 'Meeting notes',
      body: '## Agenda\n',
    });
    expect(noteFromMarkdownFile('.md', 'text')).toEqual({ title: 'Imported note', body: 'text' });
  });

  it('shortens titles to the limit', () => {
    const { title } = noteFromMarkdownFile('x.md', `# ${'a'.repeat(LIMITS.title + 50)}\n`);
    expect(title).toHaveLength(LIMITS.title);
  });

  it('makes file names safe on Windows', () => {
    expect(markdownFileName('Plan: Q1/Q2 <draft>?')).toBe('Plan- Q1-Q2 -draft--.md');
    expect(markdownFileName('   ')).toBe('Note.md');
  });
});

describe('Markdown files (main process)', () => {
  it('writes an export atomically and leaves no partial file', () => {
    const dir = tempDir();
    const destination = path.join(dir, 'Plan.md');
    writeNoteMarkdown({ title: 'Plan', body: 'Body\n' }, destination);
    expect(fs.readFileSync(destination, 'utf8')).toBe('# Plan\n\nBody\n');
    expect(fs.readdirSync(dir)).toEqual(['Plan.md']);
  });
});

describe('importProblem', () => {
  it('accepts .md and .markdown files up to 1 MB', () => {
    expect(importProblem('Plan.md', 10)).toBeNull();
    expect(importProblem('PLAN.MARKDOWN', LIMITS.description)).toBeNull();
  });

  it('explains why other files are skipped', () => {
    expect(importProblem('Notes.txt', 10)).toBe('Only .md and .markdown files can be imported.');
    expect(importProblem('Big.md', LIMITS.description + 1)).toBe('It is larger than 1 MB.');
  });
});
