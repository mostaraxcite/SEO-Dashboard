import { ChartColumn, CircleHelp, FolderPlus, Globe, Handshake, Megaphone, Palette, PenLine, SquareCheck, Store } from "lucide-react";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  megaphone: Megaphone,
  palette: Palette,
  store: Store,
  globe: Globe,
  handshake: Handshake,
  "circle-help": CircleHelp,
  "pen-line": PenLine,
  "chart-column": ChartColumn,
  "folder-plus": FolderPlus,
  "square-check": SquareCheck,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const I = icons[name] ?? CircleHelp;
  return <I className={className} aria-hidden="true" />;
}
