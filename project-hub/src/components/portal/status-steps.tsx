import { Check } from "lucide-react";
import type { T } from "@/i18n";
import { cn } from "@/lib/cn";

const STEPS = ["received", "under_review", "in_progress", "delivered"] as const;

/** Four-step progress the requester can read at a glance; text, not color, carries the meaning. */
export function StatusSteps({ internal, t }: { internal: string; t: T }) {
  if (internal === "declined") return null;
  const idx = internal === "new" ? 0 : ["triage", "needs_info"].includes(internal) ? 1 : ["delivered", "closed"].includes(internal) ? 3 : 2;
  const status = internal === "closed" ? "closed" : "";
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={t("common.status")}>
      {STEPS.map((s, i) => {
        const done = i < idx || (i === idx && (s === "delivered" || status === "closed"));
        const current = i === idx;
        return (
          <li key={s} className="min-w-0" aria-current={current ? "step" : undefined}>
            <div className={cn("h-1 rounded-full", i <= idx ? "bg-brand" : "bg-neutral-soft")} />
            <div className={cn("mt-1.5 flex items-center gap-1 truncate text-xs", current ? "font-medium text-fg" : done ? "text-fg-2" : "text-muted")}>
              {done ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{t(`request.public.${s}`)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
