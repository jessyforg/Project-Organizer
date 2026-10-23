import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bold, ChevronDown, Code, Italic, Link2, Strikethrough, Unlink } from 'lucide-react';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import { MenuList } from '../../components/ui';
import { BLOCK_ICONS, DEFAULT_BLOCK_ICON } from './block-icons';
import { actionsFor, EXTERNAL_LINK, formatState } from './editor-config';
import { slashCommandsFor, slashCommandsKey } from './slash-commands';
import { useRovingFocus } from './useRovingFocus';

const MARK_ICONS: Record<string, typeof Bold> = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code,
};

const LINK_ERROR = 'Use a web address (https://…) or an email address.';

/**
 * Turns what was typed into a link address the editor accepts (the same rule as EXTERNAL_LINK):
 * "example.com" becomes https://example.com and "me@example.com" a mailto: link. Anything with
 * another scheme, such as javascript:, is refused.
 */
export function normalizeLink(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const email = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/;
  // A scheme is letters then ":", but not "example.com:8080" (a port).
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value);
  const href = hasScheme ? value : email.test(value) ? `mailto:${value}` : `https://${value}`;
  if (!EXTERNAL_LINK.test(href) || /\s/.test(href)) return null;
  try {
    new URL(href);
  } catch {
    return null;
  }
  return href;
}

/**
 * Shown for a text selection the user can format: not in read-only notes, not inside code, not
 * for a selected block such as a divider, and only while the editor (or the bubble) has focus.
 */
const shouldShow: NonNullable<BubbleMenuProps['shouldShow']> = ({
  editor,
  element,
  view,
  state,
  from,
  to,
}) => {
  if (!editor.isEditable) return false;
  if (!view.hasFocus() && !element.contains(document.activeElement)) return false;
  const { selection } = state;
  if (selection.empty || selection instanceof NodeSelection) return false;
  if (!state.doc.textBetween(from, to).length) return false;
  if (selection.$from.parent.type.spec.code) return false;
  return !(slashCommandsKey.getState(state) as { active?: boolean } | undefined)?.active;
};

/**
 * The formatting bubble (stage 1 of 0.6.0): a small toolbar above selected text with the inline
 * formats, "Turn into" for the block, and a link field. It follows the toolbar pattern; Alt+F10
 * moves focus into it from the text and Escape goes back.
 */
export function FormattingBubble({ editor }: { editor: Editor }) {
  const id = useId();
  const marks = useMemo(() => actionsFor(editor).filter((a) => a.id in MARK_ICONS), [editor]);
  const blocks = useMemo(() => slashCommandsFor(editor).filter((c) => !c.insertOnly), [editor]);
  const hasLink = useMemo(
    () => editor.extensionManager.extensions.some((e) => e.name === 'link'),
    [editor],
  );
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      marks: formatState(e, marks),
      block: blocks.find((b) => b.isActive(e)) ?? null,
      href: hasLink ? ((e.getAttributes('link')['href'] as string | undefined) ?? null) : null,
    }),
  });
  const [mode, setMode] = useState<'tools' | 'turn' | 'link'>('tools');
  const element = useRef<HTMLDivElement>(null);
  const turnButton = useRef<HTMLButtonElement | null>(null);
  // Created once: BubbleMenu sends new options to its plugin as a transaction, and a transaction
  // on a just-opened note lets the editor add a trailing paragraph, which counts as an edit.
  const [options] = useState(() => ({
    placement: 'top' as const,
    offset: 8,
    flip: {},
    shift: { padding: 8 },
    onHide: () => setMode('tools'),
  }));
  const roving = useRovingFocus(1 + marks.length + (hasLink ? 1 : 0));

  // Alt+F10 in the text moves focus to the bubble, as in other editors' floating toolbars.
  useEffect(() => {
    const body = editor.view.dom;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.altKey || event.key !== 'F10' || !element.current?.isConnected) return;
      event.preventDefault();
      element.current.querySelector<HTMLElement>('[role="toolbar"] button')?.focus();
    };
    body.addEventListener('keydown', onKeyDown);
    return () => body.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const backToText = (event: KeyboardEvent) => {
    // Escape stops here, so it does not also leave focus mode.
    event.stopPropagation();
    event.preventDefault();
    setMode('tools');
    // At once, keeping the selection (the focus command would wait for the next frame).
    editor.view.focus();
  };

  const turnLabel = state.block?.label ?? 'Text';
  const TurnIcon = (state.block && BLOCK_ICONS[state.block.id]) ?? DEFAULT_BLOCK_ICON;

  return (
    <BubbleMenu
      ref={element}
      editor={editor}
      shouldShow={shouldShow}
      className="bubble"
      options={options}
    >
      {mode === 'link' ? (
        <LinkForm
          href={state.href}
          onApply={(href) => {
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            setMode('tools');
          }}
          onRemove={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            setMode('tools');
          }}
          onCancel={backToText}
        />
      ) : (
        <div
          className="bubble__tools"
          role="toolbar"
          aria-label="Selection formatting"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && mode === 'tools') backToText(event);
            else if (mode === 'tools') roving.onKeyDown(event);
          }}
        >
          <div className="menu-anchor">
            <button
              {...roving.itemProps(0)}
              ref={(el) => {
                roving.itemProps(0).ref(el);
                turnButton.current = el;
              }}
              type="button"
              className="bubble__button bubble__turn"
              aria-label={`Turn into: ${turnLabel}`}
              title="Turn into"
              aria-haspopup="menu"
              aria-expanded={mode === 'turn'}
              aria-controls={mode === 'turn' ? `${id}-turn` : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode(mode === 'turn' ? 'tools' : 'turn')}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMode('turn');
                }
              }}
            >
              <TurnIcon aria-hidden />
              <span>{turnLabel}</span>
              <ChevronDown aria-hidden className="bubble__chevron" />
            </button>
            {mode === 'turn' && (
              <MenuList
                id={`${id}-turn`}
                label="Turn into"
                className="menu bubble__menu"
                items={blocks.map((block) => ({
                  label: block.label,
                  icon: BLOCK_ICONS[block.id] ?? DEFAULT_BLOCK_ICON,
                  onSelect: () => {
                    const at = editor.state.selection.from;
                    block.run(editor, { from: at, to: at });
                  },
                }))}
                onClose={(refocus) => {
                  setMode('tools');
                  if (refocus) turnButton.current?.focus();
                }}
              />
            )}
          </div>
          <span className="bubble__divider" aria-hidden="true" />
          {marks.map((action, index) => {
            const Icon = MARK_ICONS[action.id] ?? Bold;
            return (
              <button
                key={action.id}
                {...roving.itemProps(index + 1)}
                type="button"
                className="bubble__button"
                aria-label={`${action.label} (${action.shortcut})`}
                title={`${action.label} (${action.shortcut})`}
                aria-pressed={state.marks[action.id]?.active ?? false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => action.run(editor)}
              >
                <Icon aria-hidden />
              </button>
            );
          })}
          {hasLink && (
            <>
              <span className="bubble__divider" aria-hidden="true" />
              <button
                {...roving.itemProps(marks.length + 1)}
                type="button"
                className="bubble__button"
                aria-label={state.href ? 'Edit link' : 'Link'}
                title={state.href ? 'Edit link' : 'Link'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMode('link')}
              >
                <Link2 aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
    </BubbleMenu>
  );
}

function LinkForm({
  href,
  onApply,
  onRemove,
  onCancel,
}: {
  href: string | null;
  onApply: (href: string) => void;
  onRemove: () => void;
  onCancel: (event: KeyboardEvent) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(href ?? '');
  const [error, setError] = useState(false);
  return (
    <form
      className="bubble__link"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim() && href) return onRemove();
        const next = normalizeLink(value);
        if (next) onApply(next);
        else setError(true);
      }}
    >
      <label className="visually-hidden" htmlFor={`${id}-href`}>
        Link address
      </label>
      <input
        id={`${id}-href`}
        className="input bubble__input"
        // Choosing Link opened this field, so focus belongs here.
        autoFocus
        value={value}
        placeholder="Paste or type a link"
        aria-invalid={error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel(e);
        }}
      />
      <button type="submit" className="btn btn--small btn--primary">
        Apply
      </button>
      {href && (
        <button
          type="button"
          className="bubble__button"
          aria-label="Remove link"
          title="Remove link"
          onClick={onRemove}
        >
          <Unlink aria-hidden />
        </button>
      )}
      {error && (
        <p id={`${id}-error`} className="bubble__error" role="alert">
          {LINK_ERROR}
        </p>
      )}
    </form>
  );
}
