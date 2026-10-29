"use client";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";

/** AI is an integrated capability: same tokens as the rest of the UI, marked by a small icon + label. */
export function AiTrigger({ label, onClick, loading, disabled, title }: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean; title?: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-busy={loading || undefined}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-60"
    >
      <Sparkles className={cn("h-3.5 w-3.5 text-accent", loading && "animate-pulse")} aria-hidden="true" />
      {loading ? t("ai.thinking") : label}
    </button>
  );
}

export function AiCard({ title, provider, cached, children, actions, onDismiss }: { title: string; provider: string; cached?: boolean; children: React.ReactNode; actions?: React.ReactNode; onDismiss?: () => void }) {
  const { t } = useI18n();
  return (
    <section className="animate-in rounded-lg border border-line bg-surface shadow-sm" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-2">
        <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        <span className="text-sm font-medium">{title}</span>
        <span className="ms-auto flex items-center gap-2 text-xs text-muted">
          {provider === "mock" ? <span className="rounded border border-dashed border-line-strong px-1.5">{t("ai.mockBadge")}</span> : null}
          {cached ? <span>cache</span> : null}
        </span>
      </header>
      <div className="px-3.5 py-3">{children}</div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2">
        <span className="me-auto text-xs text-muted">{t("ai.generated")}</span>
        {actions}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="h-8 rounded-md px-2.5 text-sm text-fg-2 hover:bg-hover">
            {t("ai.dismiss")}
          </button>
        ) : null}
      </footer>
    </section>
  );
}

export function AiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-3.5 py-2.5 text-sm text-fg-2">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="text-accent hover:underline">
          {t("ai.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function Evidence({ ids, labels }: { ids: string[]; labels: Record<string, string> }) {
  const { t } = useI18n();
  const shown = ids.filter((i) => labels[i]);
  if (!shown.length) return null;
  return (
    <details className="mt-3 text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-fg">
        {t("ai.evidence")} ({shown.length})
      </summary>
      <ul className="mt-1.5 space-y-1 border-s-2 border-line ps-2.5">
        {shown.map((id) => (
          <li key={id}>
            <a href={`#${id.replace(":", "-")}`} className="hover:text-fg hover:underline">
              {labels[id]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
