import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { FLASH_MS, flashBlock } from '../editor/flash-block';
import { currentEntry, outlineFromDoc, outlineFromMarkdown } from './outline';

/** The outline catches up with typing after this pause. */
export const OUTLINE_DELAY_MS = 300;

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function scrollToTop(element: Element | null | undefined) {
  (element as HTMLElement | null | undefined)?.scrollIntoView?.({
    block: 'start',
    behavior: reducedMotion() ? 'auto' : 'smooth',
  });
}

/**
 * The note outline's state (ADR-0017): whether it shows, its entries for the current mode, the
 * current heading, and jumping to an entry.
 *
 * Shown or hidden is a per-profile setting. Focus mode hides it; there the Outline button shows it
 * for the session without changing the setting.
 */
export function useNoteOutline({
  mode,
  markdownView,
  body,
  editor,
  focused,
}: {
  mode: 'visual' | 'markdown';
  markdownView: 'write' | 'preview';
  body: string;
  editor: Editor | null;
  focused: boolean;
}) {
  const panelId = `${useId()}-outline`;
  const toast = useToast();
  const settings = useQuery('settings', () => window.api.settings.get());
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [inFocus, setInFocus] = useState(false);
  const saved = chosen ?? settings.data?.noteOutline ?? false;
  const open = focused ? inFocus : saved;

  const toggle = () => {
    if (focused) return setInFocus(!inFocus);
    const next = !saved;
    setChosen(next);
    void window.api.settings.update({ noteOutline: next }).then((result) => {
      if (result.ok) return;
      setChosen(!next);
      toast({
        message: `The outline setting was not saved. ${result.error.message}`,
        tone: 'error',
      });
    });
  };

  // Visual mode: rebuilt after a pause in typing; the cursor is followed as it moves.
  const [docVersion, setDocVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!editor) return;
    let timer: number | undefined;
    const onUpdate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setDocVersion((v) => v + 1), OUTLINE_DELAY_MS);
    };
    const onSelection = () => setCursor(editor.state.selection.from);
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', onSelection);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', onSelection);
    };
  }, [editor]);

  // Markdown mode: parsed after a pause in typing.
  const [source, setSource] = useState(body);
  useEffect(() => {
    const timer = window.setTimeout(() => setSource(body), OUTLINE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [body]);

  const entries = useMemo(() => {
    if (mode === 'markdown') return outlineFromMarkdown(source);
    // docVersion: the editor's document changes without React knowing; rebuild when it does.
    void docVersion;
    return editor && !editor.isDestroyed ? outlineFromDoc(editor.state.doc) : [];
  }, [mode, source, editor, docVersion]);

  const [caret, setCaret] = useState(0);
  const [previewCurrent, setPreviewCurrent] = useState(-1);
  const current =
    mode === 'visual'
      ? currentEntry(entries, cursor)
      : markdownView === 'write'
        ? currentEntry(entries, caret)
        : previewCurrent;

  const bodyField = useRef<HTMLTextAreaElement>(null);
  const previewRoot = useRef<HTMLDivElement>(null);

  const go = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    if (mode === 'visual') {
      if (!editor || editor.isDestroyed) return;
      // Inside the heading, at its start.
      editor.commands.setTextSelection(entry.at + 1);
      editor.view.focus();
      scrollToTop(editor.view.nodeDOM(entry.at) as Element | null);
      flashBlock(editor, entry.at);
    } else if (markdownView === 'write') {
      const field = bodyField.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(entry.at, entry.at);
      setCaret(entry.at);
    } else {
      const heading = previewRoot.current?.querySelectorAll<HTMLElement>('h1, h2, h3')[index];
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      scrollToTop(heading);
      heading.classList.add('flash-block');
      window.setTimeout(() => heading.classList.remove('flash-block'), FLASH_MS);
      setPreviewCurrent(index);
    }
  };

  return {
    panelId,
    open,
    toggle,
    entries,
    current,
    go,
    bodyField,
    previewRoot,
    onCaret: setCaret,
  };
}
