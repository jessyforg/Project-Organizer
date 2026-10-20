import { useEffect, useId } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { LIMITS } from '@shared/schemas';
import { documentExtensions } from './editor-config';
import { EditorToolbar } from './EditorToolbar';

export interface DocumentEditorProps {
  title: string;
  onTitleChange: (title: string) => void;
  /** Read once, when the editor is created; later changes to this prop are ignored. */
  initialContent?: JSONContent;
  /** Called with the whole document as Tiptap JSON after every change to the body. */
  onChange?: ((content: JSONContent) => void) | undefined;
  /** Gives the caller the editor instance, for commands such as focusing. */
  onReady?: ((editor: Editor) => void) | undefined;
  titlePlaceholder?: string;
}

/**
 * A block-based rich-text editor (ADR-0012): a title field, a formatting toolbar, and the
 * document body. It holds no data of its own; the caller decides what to do with changes.
 */
export function DocumentEditor({
  title,
  onTitleChange,
  initialContent,
  onChange,
  onReady,
  titlePlaceholder = 'Untitled',
}: DocumentEditorProps) {
  const id = useId();
  const bodyId = `${id}-body`;
  const editor = useEditor({
    extensions: documentExtensions(),
    content: initialContent ?? '',
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
        'aria-label': 'Document body',
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  return (
    <div className="doc-editor">
      <label className="visually-hidden" htmlFor={`${id}-title`}>
        Document title
      </label>
      {/* A one-line field that wraps long titles instead of hiding them. */}
      <textarea
        id={`${id}-title`}
        className="doc-editor__title"
        rows={1}
        value={title}
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
      {editor && <EditorToolbar editor={editor} controls={bodyId} />}
      <EditorContent editor={editor} className="doc-editor__content" />
    </div>
  );
}
