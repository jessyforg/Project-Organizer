import { useEffect, useId, useState } from 'react';
import {
  EditorContent,
  useEditor,
  type Editor,
  type Extensions,
  type JSONContent,
} from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { LIMITS } from '@shared/schemas';
import { documentExtensions, EXTERNAL_LINK } from './editor-config';
import { EditorToolbar } from './EditorToolbar';
import { useSlashMenu } from './SlashMenu';

export interface DocumentEditorProps {
  /** With `onTitleChange`, shows a title field above the body; leave both out for no title. */
  title?: string;
  onTitleChange?: (title: string) => void;
  /** Read once, when the editor is created; later changes to this prop are ignored. */
  initialContent?: JSONContent;
  /** Read once, like `initialContent`. Defaults to the basic document set. */
  extensions?: Extensions;
  /** Called with the whole document as Tiptap JSON after every change to the body. */
  onChange?: ((content: JSONContent) => void) | undefined;
  /** Called after every change to the body, without converting it; for large documents. */
  onEdit?: (() => void) | undefined;
  /** Gives the caller the editor instance, for commands such as focusing. */
  onReady?: ((editor: Editor) => void) | undefined;
  titlePlaceholder?: string;
  /** The accessible name of the body. */
  label?: string;
  /** False shows the document read-only, without the toolbar. */
  editable?: boolean;
  /** Typing "/" opens a menu of blocks to insert (ADR-0016). Read once. */
  slashCommands?: boolean;
  className?: string;
}

/**
 * A block-based rich-text editor (ADR-0012): an optional title field, a formatting toolbar, and
 * the document body. It holds no data of its own; the caller decides what to do with changes.
 */
export function DocumentEditor({
  title,
  onTitleChange,
  initialContent,
  extensions,
  onChange,
  onEdit,
  onReady,
  titlePlaceholder = 'Untitled',
  label = 'Document body',
  editable = true,
  slashCommands = true,
  className,
}: DocumentEditorProps) {
  const id = useId();
  const bodyId = `${id}-body`;
  const slash = useSlashMenu();
  // Tiptap compares extensions by identity, so create them once.
  const [loaded] = useState(() => [
    ...(extensions ?? documentExtensions()),
    ...(slashCommands
      ? [slash.extension, Placeholder.configure({ placeholder: 'Type / for commands' })]
      : []),
  ]);
  const editor = useEditor({
    extensions: loaded,
    content: initialContent ?? '',
    editable,
    // The production Content Security Policy blocks injected <style> tags; editor.css has the
    // base styles instead.
    injectCSS: false,
    // The toolbar subscribes to the state it shows, so the editor need not re-render per keystroke.
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id: bodyId,
        class: 'doc-editor__body',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-readonly': String(!editable),
      },
      // Ctrl+click opens a web or mail link; the main process checks the address again.
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement | null)?.closest('a');
        const href = link?.getAttribute('href') ?? '';
        if (!event.ctrlKey || !EXTERNAL_LINK.test(href)) return false;
        window.open(href, '_blank', 'noopener');
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onEdit?.();
      onChange?.(e.getJSON());
    },
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    // false: Tiptap would otherwise report this as an edit, and the caller would save.
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  return (
    <div className={className ? `doc-editor ${className}` : 'doc-editor'}>
      {onTitleChange && (
        <>
          <label className="visually-hidden" htmlFor={`${id}-title`}>
            Document title
          </label>
          {/* A one-line field that wraps long titles instead of hiding them. */}
          <textarea
            id={`${id}-title`}
            className="doc-editor__title"
            rows={1}
            value={title ?? ''}
            maxLength={LIMITS.title}
            placeholder={titlePlaceholder}
            onChange={(e) => onTitleChange(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              // Enter moves on to the body, as in most document editors.
              if (e.key === 'Enter') {
                e.preventDefault();
                editor?.commands.focus('start');
              }
            }}
          />
        </>
      )}
      {editor && editable && <EditorToolbar editor={editor} controls={bodyId} />}
      <EditorContent editor={editor} className="doc-editor__content" />
      {slash.render(editor)}
    </div>
  );
}
