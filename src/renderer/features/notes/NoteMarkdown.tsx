import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Links the operating system may open; the main process checks the same list again. */
const EXTERNAL_LINK = /^(https?:|mailto:)/i;

/**
 * How Markdown elements render (docs/SECURITY.md §5):
 * - raw HTML is shown as text, never rendered (react-markdown's default without rehype-raw);
 * - web and mail links open in the system browser; other links are inert text;
 * - images are never loaded, because loading one would contact a server.
 */
const components: Components = {
  a: ({ href, children }) =>
    href && EXTERNAL_LINK.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer" title={href}>
        {children}
      </a>
    ) : (
      <span className="markdown__inert-link">{children}</span>
    ),
  img: ({ alt }) => (
    <span className="markdown__image">[Image not shown{alt ? `: ${alt}` : ''}]</span>
  ),
  // Task-list items ("- [x] …") are read-only here; give their checkboxes a name.
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={checked === true}
        disabled
        readOnly
        aria-label={checked ? 'Checked item' : 'Unchecked item'}
      />
    ) : null,
};

export function NoteMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
