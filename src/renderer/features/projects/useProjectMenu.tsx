import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Project } from '@shared/domain';
import { useNavigation } from '../../app/navigation';
import { useContextMenu } from '../../components/ui';
import { useLooks } from '../looks/useLooks';

/**
 * The right-click menu (and Shift+F10) on project rows in the sidebar and the Projects page:
 * open, star, icon, and cover (ADR-0019). Render `menu` and `dialogs` once.
 */
export function useProjectMenu() {
  const { navigate } = useNavigation();
  const context = useContextMenu();
  const looks = useLooks();
  const bind = (project: Project, label = project.name) =>
    context.bind(`Actions for project ${label}`, [
      {
        label: 'Open',
        icon: FolderOpen,
        onSelect: () => navigate({ name: 'project', id: project.id }),
      },
      ...looks.itemsFor({
        kind: 'project',
        id: project.id,
        title: label,
        favourite: project.favourite,
        icon: project.icon,
        cover: project.cover,
        editable: true,
      }),
    ]);
  const rendered: ReactNode = (
    <>
      {context.menu}
      {looks.dialogs}
    </>
  );
  return { bind, menu: rendered };
}
