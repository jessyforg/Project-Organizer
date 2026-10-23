import {
  Image as ImageIcon,
  Paperclip,
  ChevronRight,
  Info,
  Lightbulb,
  Table,
  TriangleAlert,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  TextQuote,
  Type,
} from 'lucide-react';

/** Icons for block kinds, by slash command id; shared by the slash menu and the bubble. */
export const BLOCK_ICONS: Record<string, typeof Type> = {
  paragraph: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  blockquote: TextQuote,
  codeBlock: SquareCode,
  divider: Minus,
  'callout-note': Info,
  'callout-tip': Lightbulb,
  'callout-warning': TriangleAlert,
  toggle: ChevronRight,
  table: Table,
  image: ImageIcon,
  file: Paperclip,
};

export const DEFAULT_BLOCK_ICON = Type;
