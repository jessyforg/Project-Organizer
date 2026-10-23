import { Extension, type Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey<DecorationSet>('flashBlock');

/** How long a block stays highlighted after the outline jumps to it. */
export const FLASH_MS = 1200;

/**
 * Briefly highlights a block, for example the heading the outline jumped to (ADR-0017). A
 * decoration, so the highlight never touches the document or its saved text.
 */
export const FlashBlock = Extension.create({
  name: 'flashBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(key) as { pos: number } | { clear: true } | undefined;
            if (meta && 'pos' in meta) {
              const node = tr.doc.nodeAt(meta.pos);
              if (!node) return DecorationSet.empty;
              const flash = Decoration.node(meta.pos, meta.pos + node.nodeSize, {
                class: 'flash-block',
              });
              return DecorationSet.create(tr.doc, [flash]);
            }
            if (meta) return DecorationSet.empty;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

/** Highlights the block at `pos` for a moment. */
export function flashBlock(editor: Editor, pos: number): void {
  editor.view.dispatch(editor.state.tr.setMeta(key, { pos }));
  window.setTimeout(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { clear: true }));
  }, FLASH_MS);
}
