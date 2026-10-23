import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  Archive,
  Eye,
  FileCode2,
  Maximize2,
  Minimize2,
  PenLine,
  Save,
  TableOfContents,
  Type,
} from 'lucide-react';
import type { Editor, JSONContent } from '@tiptap/react';
import type { Note } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useFocusMode } from '../../app/focus';
import { useNavigation } from '../../app/navigation';
import { usePaletteActions } from '../../app/palette-registry';
import { useToast } from '../../app/toasts';
import { TagPicker } from '../../components/TagPicker';
import { ConfirmDialog, MenuButton } from '../../components/ui';
import { formatTimestamp } from '../../lib/format';
import { DocumentEditor } from '../editor/DocumentEditor';
import { noteExtensions } from '../editor/editor-config';
import { createMarkdownCodec, type MarkdownCodec } from '../editor/markdown';
import { useLookups } from '../tasks/useLookups';
import { NoteMarkdown } from './NoteMarkdown';
import { NoteOutline } from './NoteOutline';
import { useNoteActions } from './useNoteActions';
import { useNoteOutline } from './useNoteOutline';
import { AttachmentContext, useAttachmentStore } from './attachment-store';
import { LinkResolverContext, useLinkResolver } from './link-resolver';
import { NoteBacklinks } from './NoteBacklinks';
import { useMentionPicker } from './useMentionPicker';
import { useNoteLinkPicker } from './useNoteLinkPicker';

export const UNTITLED = 'Untitled note';
/** Typing pauses this long before the note saves itself. */
export const AUTOSAVE_MS = 800;

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
};

const MARKDOWN_ONLY =
  'This note has formatting the visual editor cannot show yet, such as a table or an image, ' +
  'so it opens as Markdown. Nothing in it has been changed.';

interface Draft {
  title: string;
  body: string;
}

/** What the server will store: a blank title becomes "Untitled note". */
function normalize(draft: Draft): Draft {
  return { title: draft.title.trim() || UNTITLED, body: draft.body };
}

function same(a: Draft, b: Draft): boolean {
  return a.title === b.title && a.body === b.body;
}

let sharedCodec: MarkdownCodec | null = null;
/** One converter for all notes; building the schema is the expensive part. */
function noteCodec(): MarkdownCodec {
  sharedCodec ??= createMarkdownCodec(noteExtensions());
  return sharedCodec;
}

/**
 * Edits one note. The body is stored as Markdown (ADR-0009) and edited visually when that loses
 * nothing, otherwise as Markdown text (ADR-0013). Text saves itself after a pause; leaving the
 * screen or closing the window saves first, and asks before discarding changes that could not be
 * saved (R26).
 */
export function NoteEditor({ note }: { note: Note }) {
  const id = useId();
  const { setLeaveGuard } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const { projectList } = useLookups();
  const [opened] = useState(() => noteCodec().fromMarkdown(note.body));
  const [mode, setMode] = useState<'visual' | 'markdown'>(opened.ok ? 'visual' : 'markdown');
  const [visual, setVisual] = useState<{ key: number; content: JSONContent }>({
    key: 0,
    content: opened.ok ? opened.content : { type: 'doc', content: [] },
  });
  const [markdownView, setMarkdownView] = useState<'write' | 'preview'>(
    note.body ? 'preview' : 'write',
  );
  const [notice, setNotice] = useState<string | null>(opened.ok ? null : MARKDOWN_ONLY);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [edits, setEdits] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [leavePrompt, setLeavePrompt] = useState<{ resolve: (leave: boolean) => void } | null>(
    null,
  );
  const actions = useNoteActions();
  const { focused, setFocused } = useFocusMode();
  /** Archived notes are read-only until unarchived (ADR-0015). */
  const readOnly = note.archivedAt !== null;
  // Held in state, not a ref: the actions menu receives `rename` during render.
  const [titleField, setTitleField] = useState<HTMLTextAreaElement | null>(null);
  const folders = useQuery('note-folders', () => window.api.noteFolders.list());

  const draft = useRef<Draft>({ title: note.title, body: note.body });
  const saved = useRef<Draft>({ title: note.title, body: note.body });
  const inFlight = useRef<Promise<boolean> | null>(null);
  const editor = useRef<Editor | null>(null);
  /** The visual editor has changes not yet converted into `draft.body`. */
  const editorChanged = useRef(false);

  /** Converts visual edits to Markdown. Done only when needed, because long notes take time. */
  const flushEditor = useCallback(() => {
    if (!editorChanged.current || !editor.current) return;
    draft.current = { ...draft.current, body: noteCodec().toMarkdown(editor.current.getJSON()) };
    editorChanged.current = false;
  }, []);

  const isDirty = useCallback(
    () => editorChanged.current || !same(normalize(draft.current), saved.current),
    [],
  );

  /** Saves the current text; resolves false if the save failed. Saves never overlap. */
  const save = useCallback(async (): Promise<boolean> => {
    flushEditor();
    while (inFlight.current) await inFlight.current;
    flushEditor();
    const next = normalize(draft.current);
    if (same(next, saved.current)) {
      setSaveState('saved');
      return true;
    }
    const run = (async () => {
      setSaveState('saving');
      const result = await window.api.notes.update({ id: note.id, ...next });
      if (!result.ok) {
        setSaveState('error');
        toast({ message: `The note was not saved. ${result.error.message}`, tone: 'error' });
        return false;
      }
      saved.current = { title: result.data.title, body: result.data.body };
      setSaveState(isDirty() ? 'pending' : 'saved');
      invalidate();
      return true;
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, [note.id, toast, invalidate, isDirty, flushEditor]);

  const edit = (next: Partial<Draft>) => {
    draft.current = { ...draft.current, ...next };
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    setSaveState(isDirty() ? 'pending' : 'saved');
  };

  const onVisualEdit = useCallback(() => {
    editorChanged.current = true;
    setSaveState('pending');
    setEdits((n) => n + 1);
  }, []);

  // Also held in state, for the outline, which follows the editor's document.
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const onEditorReady = useCallback((instance: Editor) => {
    editor.current = instance;
    setEditorInstance(instance);
  }, []);
  // Destructured: the refs are kept apart from the values read while rendering.
  const { bodyField, previewRoot, ...outline } = useNoteOutline({
    mode,
    markdownView,
    body,
    editor: editorInstance,
    focused,
  });
  // Links to other notes (ADR-0017): current titles, opening them, and the [[ picker. The
  // editor reads its extensions once, so they are made once, with the resolver.
  const links = useLinkResolver(note);
  const linkPicker = useNoteLinkPicker(links);
  const mentionPicker = useMentionPicker(links);
  // Images and files in the note (stage 6).
  const attachments = useAttachmentStore(note.id);
  const [extensions] = useState(() => noteExtensions({ links, attachments }));

  const showMarkdown = () => {
    flushEditor();
    setBody(draft.current.body);
    setMarkdownView('write');
    setMode('markdown');
  };

  const showVisual = () => {
    const result = noteCodec().fromMarkdown(draft.current.body);
    if (!result.ok) return setNotice(MARKDOWN_ONLY);
    setNotice(null);
    setVisual((v) => ({ key: v.key + 1, content: result.content }));
    setMode('visual');
  };

  // Autosave after a pause in typing.
  useEffect(() => {
    if (!isDirty()) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [title, body, edits, isDirty, save]);

  // Leaving the screen saves first; if saving fails, ask before discarding.
  useEffect(() => {
    setLeaveGuard(async () => {
      if (!isDirty() || (await save())) return true;
      return new Promise<boolean>((resolve) => setLeavePrompt({ resolve }));
    });
    return () => setLeaveGuard(null);
  }, [setLeaveGuard, isDirty, save]);

  // Closing the window: start saving and hold the close; the main process retries it.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      void save();
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, save]);

  // If the editor goes away some other way (for example, the note was trashed), save anyway.
  useEffect(
    () => () => {
      if (isDirty()) void save();
    },
    [isDirty, save],
  );

  const answerLeave = (leave: boolean) => {
    leavePrompt?.resolve(leave);
    setLeavePrompt(null);
  };

  const move = async (projectId: string) => {
    const result = await window.api.notes.move({ id: note.id, projectId });
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    toast({ message: 'Note moved.' });
  };

  const setFolder = async (folderId: string | null) => {
    const result = await window.api.notes.setFolder({ id: note.id, folderId });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const rename = () => {
    titleField?.focus();
    titleField?.select();
  };

  const unarchive = async () => {
    const result = await window.api.notes.unarchive({ id: note.id });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const setTags = async (tagIds: string[]) => {
    const result = await window.api.tags.setNoteTags({ noteId: note.id, tagIds });
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
    invalidate();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  };

  const projects = projectList.filter((p) => p.archivedAt === null || p.id === note.projectId);

  // The ⋯ menu, also offered by the command palette (ADR-0018).
  const menuItems = () =>
    actions.itemsFor(
      {
        id: note.id,
        title: title.trim() || UNTITLED,
        folderId: note.folderId,
        archivedAt: note.archivedAt,
      },
      {
        // Actions work on what is on screen, so they save first (ADR-0014).
        beforeAction: save,
        onRename: rename,
        onTrashed: () => setLeaveGuard(null),
      },
    );
  usePaletteActions(`Note: ${title.trim() || UNTITLED}`, () => [
    ...(readOnly
      ? []
      : [{ label: 'Save now', icon: Save, shortcut: 'Ctrl+S', onSelect: () => void save() }]),
    {
      label: focused ? 'Leave focus mode' : 'Focus mode',
      icon: focused ? Minimize2 : Maximize2,
      shortcut: 'Ctrl+Shift+F',
      onSelect: () => setFocused(!focused),
    },
    ...menuItems(),
  ]);

  return (
    <div className="note-editor" onKeyDown={onKeyDown}>
      <div className="note-editor__top">
        <label className="visually-hidden" htmlFor={`${id}-title`}>
          Note title
        </label>
        {/* A one-line field that wraps long titles instead of hiding them. */}
        <textarea
          ref={setTitleField}
          id={`${id}-title`}
          className="note-editor__title"
          rows={1}
          value={title}
          maxLength={LIMITS.title}
          placeholder={UNTITLED}
          readOnly={readOnly}
          onChange={(e) => edit({ title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            // Enter moves on to the visual body, as in most document editors.
            if (mode === 'visual') editor.current?.commands.focus('start');
          }}
        />
        <span className={`save-state save-state--${saveState}`} data-testid="note-save-state">
          {SAVE_LABEL[saveState]}
        </span>
        {saveState === 'error' && (
          <button type="button" className="btn" onClick={() => void save()}>
            Try again
          </button>
        )}
        <MenuButton label="Note actions" items={menuItems} />
      </div>

      {readOnly && (
        <div className="notice note-editor__archived" role="status">
          <Archive aria-hidden />
          <span>This note is archived, so it cannot be edited.</span>
          <button type="button" className="btn" onClick={() => void unarchive()}>
            Unarchive
          </button>
        </div>
      )}

      {/* Focus mode leaves out the details (a hidden attribute would lose to display: grid). */}
      {!focused && (
        <div className="note-editor__meta">
          <div className="note-editor__places">
            <div className="field">
              <label htmlFor={`${id}-project`}>Project</label>
              <select
                id={`${id}-project`}
                className="select"
                value={note.projectId}
                onChange={(e) => void move(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-folder`}>Folder</label>
              <select
                id={`${id}-folder`}
                className="select"
                value={note.folderId ?? ''}
                onChange={(e) => void setFolder(e.target.value || null)}
              >
                <option value="">No folder</option>
                {(folders.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TagPicker selected={note.tagIds} onChange={setTags} />
        </div>
      )}

      <div className="note-editor__modes">
        <div className="segmented" role="group" aria-label="Editor">
          <button type="button" aria-pressed={mode === 'visual'} onClick={showVisual}>
            <Type aria-hidden /> Visual
          </button>
          <button type="button" aria-pressed={mode === 'markdown'} onClick={showMarkdown}>
            <FileCode2 aria-hidden /> Markdown
          </button>
        </div>
        {mode === 'markdown' && (
          <>
            <div className="segmented" role="group" aria-label="Markdown view">
              <button
                type="button"
                aria-pressed={markdownView === 'write'}
                onClick={() => setMarkdownView('write')}
              >
                <PenLine aria-hidden /> Write
              </button>
              <button
                type="button"
                aria-pressed={markdownView === 'preview'}
                onClick={() => setMarkdownView('preview')}
              >
                <Eye aria-hidden /> Preview
              </button>
            </div>
            <span className="muted small">
              Markdown: # heading, **bold**, - list, [link](https://…)
            </span>
          </>
        )}
        {mode === 'visual' && (
          <span className="muted small">
            Type [[ to link a note, @ for a task. Ctrl+click opens web links.
          </span>
        )}
        <button
          type="button"
          className="btn btn--quiet note-editor__outline-toggle"
          aria-pressed={outline.open}
          aria-controls={outline.open ? outline.panelId : undefined}
          onClick={outline.toggle}
        >
          <TableOfContents aria-hidden /> Outline
        </button>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <LinkResolverContext.Provider value={links}>
        <AttachmentContext.Provider value={attachments}>
          <div
            className={
              outline.open
                ? 'note-editor__workspace note-editor__workspace--outline'
                : 'note-editor__workspace'
            }
          >
            <div className="note-editor__content">
              {mode === 'visual' ? (
                <DocumentEditor
                  key={visual.key}
                  className="note-editor__doc"
                  label="Note text"
                  extensions={extensions}
                  menus={[linkPicker, mentionPicker]}
                  editable={!readOnly}
                  initialContent={visual.content}
                  onEdit={onVisualEdit}
                  onReady={onEditorReady}
                />
              ) : markdownView === 'write' ? (
                <>
                  <label className="visually-hidden" htmlFor={`${id}-body`}>
                    Note text (Markdown)
                  </label>
                  <textarea
                    ref={bodyField}
                    id={`${id}-body`}
                    className="textarea note-editor__body"
                    value={body}
                    readOnly={readOnly}
                    maxLength={LIMITS.description}
                    onChange={(e) => edit({ body: e.target.value })}
                    onSelect={(e) => outline.onCaret(e.currentTarget.selectionStart)}
                  />
                </>
              ) : body.trim() ? (
                <div ref={previewRoot}>
                  <NoteMarkdown text={body} />
                </div>
              ) : (
                <p className="muted">Nothing to preview yet. Choose Write to add text.</p>
              )}
            </div>
            {outline.open && (
              <NoteOutline
                id={outline.panelId}
                entries={outline.entries}
                current={outline.current}
                onGo={outline.go}
              />
            )}
          </div>
        </AttachmentContext.Provider>
      </LinkResolverContext.Provider>

      {!focused && <NoteBacklinks noteId={note.id} title={title.trim() || UNTITLED} />}

      <p className="stamp">
        Created {formatTimestamp(note.createdAt)}. Updated {formatTimestamp(note.updatedAt)}.
      </p>

      {actions.dialogs}

      <ConfirmDialog
        open={leavePrompt !== null}
        title="Leave without saving?"
        body="The latest changes to this note could not be saved. If you leave now, they are lost."
        confirmLabel="Leave without saving"
        danger
        onCancel={() => answerLeave(false)}
        onConfirm={() => answerLeave(true)}
      />
    </div>
  );
}
