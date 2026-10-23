import { BLOCK_ICONS, DEFAULT_BLOCK_ICON } from './block-icons';
import { SlashCommands, type SlashCommand } from './slash-commands';
import { useSuggestionMenu } from './suggestion-menu';

/**
 * The slash command menu (ADR-0016): the blocks the editor can insert, drawn by the shared
 * suggestion menu.
 */
export function useSlashMenu() {
  return useSuggestionMenu<SlashCommand>((options) => SlashCommands.configure(options), {
    label: 'Insert a block',
    toOption: (command) => ({
      key: command.id,
      label: command.label,
      description: command.description,
      icon: BLOCK_ICONS[command.id] ?? DEFAULT_BLOCK_ICON,
    }),
    empty: (query) => `No blocks match “${query}”`,
  });
}
