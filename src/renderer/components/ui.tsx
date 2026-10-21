import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { ColorToken, Priority, Progress } from '@shared/domain';
import type { AppErrorInfo } from '@shared/result';
import { describeProgress, percent, PRIORITY_LABEL } from '../lib/format';

export function PriorityLabel({ priority }: { priority: Priority | null }) {
  if (priority === null) return null;
  return (
    <span className={`priority priority--${priority}`}>
      <span className="priority__pip" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function Swatch({ color }: { color: ColorToken | null }) {
  return (
    <span
      className="swatch"
      aria-hidden="true"
      style={{ ['--swatch' as string]: color ? `var(--c-${color})` : undefined }}
    />
  );
}

export function ProgressMeter({ progress, label }: { progress: Progress; label?: string }) {
  const value = progress.ratio === null ? 0 : Math.round(progress.ratio * 100);
  return (
    <div className="meter">
      <div
        className="meter__track"
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.ratio === null ? undefined : value}
        aria-valuetext={describeProgress(progress)}
      >
        <div className="meter__fill" style={{ width: `${value}%` }} />
      </div>
      <span className="meter__text">
        {describeProgress(progress)}
        {progress.ratio !== null && ` (${percent(progress)})`}
      </span>
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: AppErrorInfo; onRetry?: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** The top of every page: title, optional context line and description, and actions. */
export function PageHeader({
  title,
  leading,
  eyebrow,
  description,
  actions,
  titleAdornment,
}: {
  title: ReactNode;
  /** Shown before the title, e.g. a project's colour. */
  leading?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleAdornment?: ReactNode;
}) {
  return (
    <header className="page__header">
      <div className="page__heading">
        {eyebrow && <div className="page__eyebrow">{eyebrow}</div>}
        <div className="page__title-row">
          {leading}
          <h1>{title}</h1>
          {titleAdornment}
        </div>
        {description && <p className="page__description">{description}</p>}
      </div>
      {actions && <div className="page__actions">{actions}</div>}
    </header>
  );
}

/** What to show when a list is empty: what it means, and the next useful action. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: ComponentType<{ 'aria-hidden'?: boolean }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      {Icon && (
        <span className="empty__icon">
          <Icon aria-hidden />
        </span>
      )}
      <p className="empty__title">{title}</p>
      {children && <div className="empty__text">{children}</div>}
      {action}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: ComponentType<{ 'aria-hidden'?: boolean }>;
  danger?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
  onSelect: () => void;
}

/**
 * The items of a menu (WAI-ARIA menu pattern), shared by MenuButton and context menus. It focuses
 * the first item when it appears; arrows, Home, and End move; Escape closes it and asks for focus
 * to return; Tab or choosing an item closes it.
 */
function MenuList({
  id,
  label,
  items,
  onClose,
  className = 'menu',
  style,
  listRef,
}: {
  id: string;
  label: string;
  items: MenuItem[];
  onClose: (refocus: boolean) => void;
  className?: string;
  style?: CSSProperties;
  listRef?: Ref<HTMLDivElement>;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = itemRefs.current.filter((b): b is HTMLButtonElement => b !== null);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => buttons[(i + buttons.length) % buttons.length]?.focus();
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(buttons.length - 1);
    else if (event.key === 'Escape') {
      // Keep Escape from also closing a surrounding panel.
      event.stopPropagation();
      onClose(true);
    } else if (event.key === 'Tab') onClose(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  return (
    <div
      ref={listRef}
      id={id}
      className={className}
      style={style}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <div key={item.label} role="none">
          {item.separated && <div className="menu__separator" role="separator" />}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
            onClick={() => {
              onClose(true);
              item.onSelect();
            }}
          >
            {item.icon && <item.icon aria-hidden />}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * A button that opens a menu of actions (WAI-ARIA menu button pattern): Enter, Space, or
 * Arrow Down opens it on the first item; the menu then behaves as MenuList describes, and a
 * click elsewhere closes it. `items` may be a function, called when the menu opens.
 */
export function MenuButton({
  label,
  items,
}: {
  label: string;
  items: MenuItem[] | (() => MenuItem[]);
}) {
  const id = useId();
  const [open, setOpen] = useState<MenuItem[] | null>(null);
  const resolve = () => (typeof items === 'function' ? items() : items);
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(null);
    if (refocus) button.current?.focus();
  };

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        ref={button}
        type="button"
        className="btn btn--icon"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((o) => (o ? null : resolve()))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(resolve());
          }
        }}
      >
        <MoreHorizontal aria-hidden />
      </button>
      {open && <MenuList id={`${id}-menu`} label={label} items={open} onClose={close} />}
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  /** Where focus goes back to when the menu closes. */
  origin: HTMLElement;
}

/**
 * Right-click menus (ADR-0015). `bind(label, items)` returns the handlers for an element: a
 * right-click opens the menu at the pointer; Shift+F10 or the Menu key opens it below the
 * element. Render `menu` once in the component. The menu stays inside the window and closes on
 * a click elsewhere, scrolling, or resizing.
 */
export function useContextMenu() {
  const id = useId();
  const [state, setState] = useState<ContextMenuState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Measure the menu while it is hidden, then place it inside the window.
  useLayoutEffect(() => {
    if (!state || !list.current) return setPosition(null);
    const { width, height } = list.current.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(state.x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(state.y, window.innerHeight - height - margin)),
    });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onPointerDown = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [state]);

  const bind = (label: string, items: MenuItem[]) => ({
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      setState({ x: event.clientX, y: event.clientY, label, items, origin: event.currentTarget });
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setState({ x: rect.left + 16, y: rect.bottom, label, items, origin: event.currentTarget });
    },
  });

  const close = (refocus: boolean) => {
    const origin = state?.origin;
    setState(null);
    if (refocus) origin?.focus();
  };

  const menu = state ? (
    <MenuList
      id={`${id}-context`}
      label={state.label}
      items={state.items}
      onClose={close}
      className="menu menu--context"
      listRef={list}
      style={
        position
          ? { left: position.left, top: position.top }
          : { left: state.x, top: state.y, visibility: 'hidden' }
      }
    />
  ) : null;

  return { bind, menu };
}

export function Loading() {
  return (
    <p className="muted" aria-live="polite">
      Loading…
    </p>
  );
}

/**
 * Modal dialog built on the native <dialog> element, which provides focus trapping,
 * Escape to close, and an accessible modal role.
 */
export function Dialog({
  open,
  onClose,
  label,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-label={label}
      onClose={onClose}
    >
      {open && children}
    </dialog>
  );
}

/** A yes/no confirmation; the confirm button states the action. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} label={title}>
      <form
        className="dialog__form"
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2>{title}</h2>
        <div className="dialog__body">{body}</div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
