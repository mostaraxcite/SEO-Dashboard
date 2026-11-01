import { cn } from "@/lib/cn";

export function Panel({ className, children, as: As = "section", ...p }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" }) {
  return (
    <As className={cn("rounded-lg border border-line bg-surface", className)} {...p}>
      {children}
    </As>
  );
}

export function PanelHeader({ title, actions, description, className }: { title: React.ReactNode; actions?: React.ReactNode; description?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2", className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold leading-6 text-fg">{title}</h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="label mb-1.5">{eyebrow}</div> : null}
        <h1 className="text-[1.5rem] font-semibold leading-8 tracking-[-0.01em] text-fg rtl:tracking-normal">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-fg-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Avatar({ name, size = 24, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const n = (name ?? "?").trim();
  const initials = n
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => [...p][0])
    .join("")
    .toUpperCase();
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-[color:var(--text)] select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        background: `hsl(${h} 22% 86%)`,
        color: `hsl(${h} 30% 24%)`,
      }}
    >
      {initials || "?"}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 text-muted [&_svg]:h-6 [&_svg]:w-6">{icon}</div> : null}
      <p className="font-medium text-fg">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-muted">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-line", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function Meta({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[minmax(7rem,38%)_1fr] items-center gap-3 py-1.5", className)}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${v}%` }} />
      </div>
      <span className="tnum text-xs text-muted w-9 text-end">{v}%</span>
    </div>
  );
}

/**
 * A shared reference (REQ-1042, NS-1003): the one identifier the client and the team both use.
 * Set in Plex Mono with a clay tick so it reads the same on every screen and in both directions.
 */
export function Ref({ children, className, strong }: { children: React.ReactNode; className?: string; strong?: boolean }) {
  return (
    <span className={cn("ref inline-flex items-center gap-1 whitespace-nowrap", strong ? "font-medium text-fg" : "text-muted", className)}>
      <span aria-hidden="true" className="h-2.5 w-[2px] rounded-full bg-accent" />
      {children}
    </span>
  );
}
