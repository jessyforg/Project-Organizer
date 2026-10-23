/**
 * Remark plugins that let the Markdown preview show callouts and toggles (ADR-0017, stage 3)
 * the way the visual editor does. They change the syntax tree only: toggles become real
 * <details> elements built from the parsed text, so raw HTML is still never rendered
 * (docs/SECURITY.md §5). They recognise the same exact forms as the editor (blocks.ts).
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const LABELS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};
const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/;

function eachParent(node: MdNode, visit: (parent: MdNode) => void) {
  if (!node.children) return;
  visit(node);
  node.children.forEach((child) => eachParent(child, visit));
}

/** "> [!NOTE]" quotes become labelled callouts. */
export function remarkCallouts() {
  return (tree: MdNode) => {
    eachParent(tree, (parent) => {
      for (const quote of parent.children ?? []) {
        if (quote.type !== 'blockquote') continue;
        const first = quote.children?.[0];
        const text = first?.type === 'paragraph' ? first.children?.[0] : undefined;
        const match = text?.type === 'text' ? ALERT.exec(text.value ?? '') : null;
        if (!first || !text || !match) continue;
        text.value = (text.value ?? '').slice(match[0].length);
        if (text.value === '' && first.children?.length === 1) quote.children?.shift();
        const label = LABELS[match[1]!]!;
        quote.data = {
          hName: 'aside',
          hProperties: {
            className: ['callout'],
            dataKind: match[1]!.toLowerCase(),
            role: 'note',
            ariaLabel: label,
          },
        };
        quote.children?.unshift({
          type: 'paragraph',
          data: { hProperties: { className: ['callout__title'], ariaHidden: 'true' } },
          children: [{ type: 'text', value: label }],
        });
      }
    });
  };
}

const OPENING = /^<details( open)?>\n<summary>(.*)<\/summary>$/;
const unescapeHtml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Replaces "<details>…</details>" runs among `children` with details elements, nested too. */
function foldToggles(children: MdNode[]): MdNode[] {
  const result: MdNode[] = [];
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i]!;
    const opening = node.type === 'html' ? OPENING.exec(node.value ?? '') : null;
    if (!opening) {
      result.push(node);
      continue;
    }
    let depth = 1;
    let end = -1;
    for (let j = i + 1; j < children.length; j += 1) {
      const sibling = children[j]!;
      if (sibling.type !== 'html') continue;
      if (OPENING.test(sibling.value ?? '')) depth += 1;
      else if (sibling.value === '</details>') depth -= 1;
      if (depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) {
      result.push(node);
      continue;
    }
    result.push({
      type: 'toggle',
      data: { hName: 'details', hProperties: opening[1] ? { open: true } : {} },
      children: [
        {
          type: 'toggleSummary',
          data: { hName: 'summary' },
          children: [{ type: 'text', value: unescapeHtml(opening[2] ?? '') }],
        },
        ...foldToggles(children.slice(i + 1, end)),
      ],
    });
    i = end;
  }
  return result;
}

/** "<details>" toggles, in the exact form the editor writes, become details elements. */
export function remarkToggles() {
  return (tree: MdNode) => {
    eachParent(tree, (parent) => {
      parent.children = foldToggles(parent.children ?? []);
    });
  };
}
