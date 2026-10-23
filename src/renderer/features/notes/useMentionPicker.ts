import { FolderKanban, SquareCheck } from 'lucide-react';
import { MentionPicker, type LinkResolver } from '../editor/app-link';
import { describeLink } from '../editor/link-display';
import { useSuggestionMenu } from '../editor/suggestion-menu';
import type { AppLinkInfo } from '@shared/domain';

/** The @ picker (ADR-0017, stage 5): tasks and projects to mention. */
export function useMentionPicker(resolver: LinkResolver) {
  return useSuggestionMenu<AppLinkInfo>(
    (options) => MentionPicker.configure({ ...options, resolver }),
    {
      label: 'Mention a task or project',
      toOption: (item) => {
        const shown = describeLink(item.kind, item, item.label);
        const details =
          item.kind === 'task'
            ? ['Task', shown.status, shown.due && `due ${shown.due}`]
            : ['Project'];
        return {
          key: `${item.kind}/${item.id}`,
          label: item.label,
          description: details.filter(Boolean).join(' · '),
          icon: item.kind === 'task' ? SquareCheck : FolderKanban,
          ...(item.archived ? { badge: 'Archived' } : {}),
        };
      },
      empty: (query) =>
        query.trim() ? `No tasks or projects match “${query}”` : 'Type a task or project name',
    },
  );
}
