import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuButton } from '../../src/renderer/components/ui';
import { installApi, renderWithApp } from './harness';

function setup() {
  installApi();
  const archive = vi.fn();
  const trash = vi.fn();
  renderWithApp(
    <>
      <MenuButton
        label="More project actions"
        items={[
          { label: 'Archive', onSelect: archive },
          { label: 'Move to trash', danger: true, separated: true, onSelect: trash },
        ]}
      />
      <button type="button">Elsewhere</button>
    </>,
  );
  return { archive, trash, button: screen.getByRole('button', { name: 'More project actions' }) };
}

describe('MenuButton', () => {
  it('opens on the first item and moves with the arrow keys, wrapping around', async () => {
    const { button } = setup();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Move to trash' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Move to trash' })).toHaveFocus();
  });

  it('runs the chosen action, closes, and returns focus to the button', async () => {
    const { button, trash, archive } = setup();
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(trash).toHaveBeenCalledOnce();
    expect(archive).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on Escape (focus back on the button) and on a click elsewhere', async () => {
    const { button } = setup();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
