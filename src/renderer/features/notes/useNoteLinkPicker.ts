import { FilePlus2, FileText } from 'lucide-react';
import { NoteLinkPicker, type LinkResolver, type NotePickerItem } from '../editor/app-link';
import { useSuggestionMenu } from '../editor/suggestion-menu';

/** The [[ picker (ADR-0017): notes to link to, or a new note with the typed title. */
export function useNoteLinkPicker(resolver: LinkResolver) {
  return useSuggestionMenu<NotePickerItem>(
    (options) => NoteLinkPicker.configure({ ...options, resolver }),
    {
      label: 'Link to a note',
      toOption: (item) =>
        'create' in item
          ? { key: 'create', label: `Create note “${item.create}”`, icon: FilePlus2 }
          : {
              key: item.id,
              label: item.label,
              icon: FileText,
              ...(item.archived ? { badge: 'Archived' } : {}),
            },
      empty: (query) => (query.trim() ? `No notes match “${query}”` : 'No other notes yet'),
    },
  );
}
