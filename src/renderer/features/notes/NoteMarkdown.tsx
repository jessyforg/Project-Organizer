import { useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseAppLinkUrl, parseFileUrl, type AppLinkTarget } from '@shared/app-links';
import { formatSize } from '../editor/attachments';
import { describeLink } from '../editor/link-display';
import { AttachmentContext } from './attachment-store';
import { LinkResolverContext } from './link-resolver';
import { remarkCallouts, remarkToggles } from './preview-blocks';

const PLUGINS = [remarkGfm, remarkCallouts, remarkToggles];

/** Links the operating system may open; the main process checks the same list again. */
const EXTERNAL_LINK = /^(https?:|mailto:)/i;

/**
 * How Markdown elements render (docs/SECURITY.md §5):
 * - raw HTML is shown as text, never rendered (react-markdown's default without rehype-raw);
 * - web and mail links open in the system browser; links to notes, tasks, and projects
 *   (ADR-0017) open them in the app; other links are inert text;
 * - images are never loaded, because loading one would contact a server.
 */
const components: Components = {
  a: ({ href, children }) => {
    const target = parseAppLinkUrl(href);
    if (target) return <AppLinkButton target={target} fallback={children} />;
    const file = parseFileUrl(href);
    if (file) return <PreviewFile id={file} saved={textOf(children)} />;
    return href && EXTERNAL_LINK.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer" title={href}>
        {children}
      </a>
    ) : (
      <span className="markdown__inert-link">{children}</span>
    );
  },
  // Images stored with the note are shown (ADR-0017 stage 6); images on the web never load.
  img: ({ src, alt }) => {
    const file = parseFileUrl(typeof src === 'string' ? src : undefined);
    if (file) return <PreviewImage id={file} alt={alt ?? ''} />;
    return <span className="markdown__image">[Image not shown{alt ? `: ${alt}` : ''}]</span>;
  },
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

/** Keeps app addresses (react-markdown would blank them); everything else as by default. */
const urlTransform = (url: string) =>
  parseAppLinkUrl(url) || parseFileUrl(url) ? url : defaultUrlTransform(url);

/** Subscribes to an attachment store; renders again when it changes. */
function useAttachments() {
  const store = useContext(AttachmentContext);
  useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.version ?? noVersion);
  return store;
}

function PreviewImage({ id, alt }: { id: string; alt: string }) {
  const store = useAttachments();
  useEffect(() => store?.request(id, { image: true }), [store, id]);
  const url = store?.imageUrl(id);
  if (url) return <img className="markdown__stored-image" src={url} alt={alt} />;
  const missing = store?.info(id)?.missing === true;
  return (
    <span className="markdown__image">
      {missing ? `[Image not found${alt ? `: ${alt}` : ''}]` : 'Loading image…'}
    </span>
  );
}

function PreviewFile({ id, saved }: { id: string; saved: string }) {
  const store = useAttachments();
  useEffect(() => store?.request(id), [store, id]);
  const info = store?.info(id);
  const missing = info?.missing === true;
  const name = (info && !missing ? info.name : saved) || 'File';
  return (
    <span className={missing ? 'file-chip file-chip--missing' : 'file-chip'}>
      <span className="file-chip__name">{name}</span>
      <span className="file-chip__size">
        {missing ? 'not found' : info ? formatSize(info.size) : ''}
      </span>
      {store && !missing && !info?.executable && (
        <button
          type="button"
          className="file-chip__button"
          aria-label={`Open ${name}`}
          onClick={() => store.open(id)}
        >
          Open
        </button>
      )}
      {store && !missing && (
        <button
          type="button"
          className="file-chip__button"
          aria-label={`Save a copy of ${name}`}
          onClick={() => store.save(id)}
        >
          Save a copy
        </button>
      )}
    </span>
  );
}

/**
 * A link to a note, task, or project in the preview: a button showing the item's current title,
 * or that it is missing. Outside a note (no resolver) it is the saved label, inert.
 */
function AppLinkButton({ target, fallback }: { target: AppLinkTarget; fallback: ReactNode }) {
  const resolver = useContext(LinkResolverContext);
  useSyncExternalStore(resolver?.subscribe ?? noSubscribe, resolver?.version ?? noVersion);
  useEffect(() => resolver?.request(target), [resolver, target]);
  if (!resolver) return <span className="app-link">{fallback}</span>;
  // The same description as the editor's chip (link-display.ts).
  const shown = describeLink(target.kind, resolver.info(target), textOf(fallback));
  const classes = ['app-link'];
  if (shown.missing) classes.push('app-link--missing');
  if (shown.archived) classes.push('app-link--archived');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-kind={target.kind}
      aria-disabled={shown.missing}
      aria-label={shown.spoken}
      title={shown.hint}
      onClick={(event) => {
        if (!shown.missing) resolver.open(target, { focus: event.ctrlKey || event.metaKey });
      }}
    >
      {shown.category && <span className="app-link__status" data-category={shown.category} />}
      {shown.label}
      {shown.due && <span className="app-link__due">{shown.due}</span>}
    </button>
  );
}

/** The plain text of a link's label as react-markdown passes it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

const noSubscribe = () => () => undefined;
const noVersion = () => 0;

export function NoteMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={PLUGINS} components={components} urlTransform={urlTransform}>
        {text}
      </Markdown>
    </div>
  );
}
