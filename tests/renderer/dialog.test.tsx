import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Dialog } from '../../src/renderer/components/ui';

describe('Dialog', () => {
  it('stays open when a confirmation inside it closes', () => {
    const onClose = vi.fn();
    function Host() {
      const [asking, setAsking] = useState(true);
      return (
        <Dialog open onClose={onClose} label="Outer">
          <ConfirmDialog
            open={asking}
            title="Sure?"
            body="Really."
            confirmLabel="Yes"
            onConfirm={() => setAsking(false)}
            onCancel={() => setAsking(false)}
          />
        </Dialog>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.queryByRole('dialog', { name: 'Sure?' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy();
  });
});
