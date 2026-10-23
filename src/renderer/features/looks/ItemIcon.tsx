import {
  Book,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  ChartColumn,
  CircleCheck,
  Clipboard,
  Code,
  Coffee,
  Compass,
  Cpu,
  Database,
  FileText,
  Flag,
  Folder,
  Gift,
  Globe,
  House,
  Key,
  Layers,
  Lightbulb,
  Map,
  Megaphone,
  Package,
  Palette,
  Plane,
  Shield,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { parseIcon, type LucideIconName } from '@shared/icons';

/** The lucide components behind the built-in icons (ADR-0019). */
export const LUCIDE: Record<LucideIconName, LucideIcon> = {
  Folder,
  Book,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  ChartColumn,
  CircleCheck,
  Clipboard,
  Code,
  Coffee,
  Compass,
  Cpu,
  Database,
  FileText,
  Flag,
  Gift,
  Globe,
  House,
  Key,
  Layers,
  Lightbulb,
  Map,
  Megaphone,
  Package,
  Palette,
  Plane,
  Shield,
  Users,
  Wrench,
};

/**
 * A project's or note's icon, or nothing for an unknown value. Decorative: the item's name is
 * always shown beside it.
 */
export function ItemIcon({ value, className }: { value: string | null; className?: string }) {
  const icon = parseIcon(value);
  if (!icon) return null;
  const classes = ['item-icon', className].filter(Boolean).join(' ');
  if (icon.kind === 'emoji') {
    return (
      <span className={`${classes} item-icon--emoji`} aria-hidden="true">
        {icon.char}
      </span>
    );
  }
  const Icon = LUCIDE[icon.name];
  return (
    <span className={classes} aria-hidden="true">
      <Icon />
    </span>
  );
}
