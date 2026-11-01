"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  icon,
  label,
  badge,
  exact,
  onNavigate,
  variant = "side",
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  exact?: boolean;
  onNavigate?: () => void;
  variant?: "side" | "top" | "top-spine";
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  if (variant === "top-spine")
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative inline-flex h-14 shrink-0 items-center gap-1.5 px-2.5 text-sm transition-colors",
          active ? "font-medium text-on-spine" : "text-spine-muted hover:text-on-spine",
        )}
      >
        {label}
        {badge ? <span className="ref rounded-sm bg-spine-mark px-1.5 py-px text-[0.6875rem] font-medium text-spine">{badge}</span> : null}
        {active ? <span aria-hidden="true" className="absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full bg-spine-mark" /> : null}
      </Link>
    );
  if (variant === "top")
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors [&_svg]:h-4 [&_svg]:w-4",
          active ? "bg-brand-soft font-medium text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
        )}
      >
        {icon}
        {label}
        {badge ? <span className="tnum rounded bg-accent-soft px-1.5 text-xs font-medium text-accent">{badge}</span> : null}
      </Link>
    );
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[0.84rem] transition-colors tap",
        active ? "bg-spine-active font-medium text-on-spine" : "text-spine-muted hover:bg-spine-hover hover:text-on-spine",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-2 -start-3 w-[3px] rounded-e-full bg-spine-mark" /> : null}
      <span className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[1.75]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge ? <span className="ref rounded-sm bg-spine-mark px-1.5 py-px text-[0.6875rem] font-medium text-spine">{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}

export function TabLink({ href, label, count, isDefault }: { href: string; label: string; count?: number; isDefault?: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const [hrefPath, hrefQuery] = href.split("?");
  const tab = new URLSearchParams(hrefQuery ?? "").get("tab");
  const current = sp.get("tab");
  const active = path === hrefPath && (tab === null || current === tab || (isDefault === true && !current));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
        active ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {label}
      {count !== undefined ? <span className="tnum text-xs text-muted">{count}</span> : null}
    </Link>
  );
}
