"use client";
import { useState, useTransition } from "react";
import { Lock, Globe } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/i18n";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";

export type ThreadItem = { id: string; body: string; authorName: string | null; createdAt: string; kind?: string; authorKind?: string };

/**
 * One component, two clearly different modes. `internal` threads are styled and labelled
 * as staff-only; `public` threads say who can see them. There is no visibility toggle.
 */
export function Thread({
  items,
  mode,
  anchorPrefix,
  placeholder,
  submitLabel,
  onSubmit,
  emptyText,
  visibilityLabel,
}: {
  items: ThreadItem[];
  mode: "internal" | "public";
  anchorPrefix: string;
  placeholder: string;
  submitLabel: string;
  onSubmit?: (body: string) => Promise<ActionResult>;
  emptyText?: string;
  visibilityLabel?: string;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div>
      {items.length === 0 && emptyText ? <p className="px-4 py-3 text-sm text-muted">{emptyText}</p> : null}
      <ol className="space-y-0">
        {items.map((c) => (
          <li key={c.id} id={`${anchorPrefix}-${c.id}`} className="flex gap-3 px-4 py-3 target:bg-accent-soft/60">
            <Avatar name={c.authorName ?? "?"} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-fg">{c.authorName ?? "—"}</span>
                {c.kind === "question" ? <span className="text-xs font-medium text-warning">{t("request.question")}</span> : null}
                <time className="text-xs text-muted" dateTime={c.createdAt} suppressHydrationWarning>
                  {formatRelative(c.createdAt, locale)}
                </time>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-fg-2" dir="auto">
                {c.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {onSubmit ? (
        <form
          className={cn("m-3 rounded-md border", mode === "internal" ? "border-dashed border-line-strong bg-sunken" : "border-line bg-surface")}
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            start(async () => {
              const r = await onSubmit(body);
              if (r.ok) setBody("");
              else toast({ tone: "error", text: r.error });
            });
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            rows={2}
            dir="auto"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label={placeholder}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              {mode === "internal" ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              {visibilityLabel ?? (mode === "internal" ? t("task.internalOnly") : t("request.publicNote"))}
            </span>
            <Button type="submit" size="sm" variant={mode === "internal" ? "secondary" : "primary"} loading={pending} disabled={!body.trim()}>
              {submitLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
