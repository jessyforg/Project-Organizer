import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom has no layout, so Range lacks the geometry ProseMirror reads when scrolling the cursor
// into view; report empty boxes.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects() {
    return Object.assign([], { item: () => null });
  };
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return new DOMRect();
  };
}
// For the same reason, a click cannot be mapped to a position; ProseMirror then keeps the
// current selection.
if (!('elementFromPoint' in document)) {
  Object.assign(document, { elementFromPoint: () => null });
}

// jsdom does not implement <dialog> modality; emulate the parts the app relies on.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
