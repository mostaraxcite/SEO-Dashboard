import type { T, Locale } from "@/i18n";
import { formatDateTime } from "@/i18n";

export type TimelineEvent = { id: string; type: string; data: Record<string, unknown>; createdAt: Date; actorName: string | null; visibility?: string };

/** Human-readable activity log. Status values are translated; nothing raw is shown. */
export function Timeline({ events, t, locale, timeZone, statusNs = "task.status" }: { events: TimelineEvent[]; t: T; locale: Locale; timeZone: string; statusNs?: string }) {
  if (!events.length) return null;
  return (
    <ol className="relative space-y-3 ps-4 before:absolute before:inset-y-1 before:start-[3px] before:w-px before:bg-line">
      {events.map((e) => {
        const d = e.data ?? {};
        const vars: Record<string, string> = {};
        for (const [k, v] of Object.entries(d)) vars[k] = v == null ? "—" : String(v);
        if (d.to) vars.to = t.dyn(`${statusNs}.${d.to}`, undefined, String(d.to));
        const text = t.has(`activity.${e.type}`) ? t.dyn(`activity.${e.type}`, vars) : t("activity.fallback");
        return (
          <li key={e.id} className="relative text-sm">
            <span aria-hidden="true" className="absolute -start-4 top-1.5 h-[7px] w-[7px] rounded-full border border-line-strong bg-surface" />
            <span className="font-medium text-fg">{e.actorName ?? t("app.name")}</span> <span className="text-fg-2">{text}</span>
            {d.auto ? <span className="text-muted"> (auto)</span> : null}
            <time className="block text-xs text-muted" dateTime={e.createdAt.toISOString()}>
              {formatDateTime(e.createdAt, locale, timeZone)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
