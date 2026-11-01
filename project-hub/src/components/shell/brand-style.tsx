import { brandStyle } from "@/lib/color";

/** Injects validated workspace brand tokens at :root so portals (dialogs, menus) inherit them too. */
export function BrandStyle({ color }: { color: string | null | undefined }) {
  const vars = brandStyle(color);
  const entries = Object.entries(vars);
  if (!entries.length) return null;
  // Values are generated hex colors from a validated input — safe to inline.
  const css = `:root{${entries.map(([k, v]) => `${k}:${v}`).join(";")}}`;
  return <style>{css}</style>;
}

export function WorkspaceMark({ name, size = 28, logoSrc, onSpine }: { name: string; size?: number; logoSrc?: string | null; onSpine?: boolean }) {
  if (logoSrc)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoSrc} alt="" className={`shrink-0 rounded-md object-contain ${onSpine ? "bg-white p-0.5" : ""}`} style={{ height: size, width: "auto", maxWidth: size * 3 }} />;
  const initials = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold ${onSpine ? "bg-spine-mark text-spine" : "bg-brand text-on-brand"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials || "•"}
    </span>
  );
}
