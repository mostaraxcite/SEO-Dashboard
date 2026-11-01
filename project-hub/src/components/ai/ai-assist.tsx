"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { runAiAction, dismissDraftAction, saveSummaryAction } from "@/app/ai-actions";
import { createTaskAction } from "@/app/w/[slug]/actions";
import type { AiRunResult, AiTarget } from "@/server/ai/service";
import { AiCard, AiError, AiTrigger, Evidence } from "./ai-frame";

type Summary = AiRunResult<"summarize">;
type Next = AiRunResult<"next_steps">;

/**
 * Summarize + What's next for a task or request. Both run only on click,
 * show grounded evidence, and change nothing unless the user applies them.
 */
export function AiAssist({
  slug,
  target,
  staff = true,
  allowNextSteps = true,
  taskParent,
}: {
  slug: string;
  target: AiTarget;
  staff?: boolean;
  allowNextSteps?: boolean;
  taskParent?: { requestId?: string | null; parentTaskId?: string | null; projectId?: string | null };
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  const [error, setError] = useState<{ msg: string; retry: () => void } | null>(null);
  const [loading, setLoading] = useState<"summarize" | "next_steps" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (feature: "summarize" | "next_steps") => {
    setError(null);
    setLoading(feature);
    start(async () => {
      const r = await runAiAction(slug, feature, target);
      setLoading(null);
      if (!r.ok) {
        setError({ msg: r.error, retry: () => run(feature) });
        return;
      }
      if (feature === "summarize") setSummary(r.data as Summary);
      else setNext(r.data as Next);
    });
  };
  const dismiss = (which: "summarize" | "next_steps") => {
    const d = which === "summarize" ? summary : next;
    if (d) void dismissDraftAction(slug, d.draftId);
    if (which === "summarize") {
      setSummary(null);
      setEditing(null);
    } else setNext(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <AiTrigger label={t("ai.summarize")} onClick={() => run("summarize")} loading={loading === "summarize"} disabled={pending && loading !== "summarize"} />
        {allowNextSteps ? <AiTrigger label={t("ai.nextSteps")} onClick={() => run("next_steps")} loading={loading === "next_steps"} disabled={pending && loading !== "next_steps"} /> : null}
      </div>
      {error ? <AiError message={error.msg} onRetry={error.retry} /> : null}
      {summary ? (
        <AiCard
          title={t("ai.summarize")}
          provider={summary.provider}
          cached={summary.cached}
          onDismiss={() => dismiss("summarize")}
          actions={
            staff ? (
              editing === null ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(summaryText(summary, t))}>
                  {t("ai.postAsNote")}
                </Button>
              ) : null
            ) : null
          }
        >
          {editing !== null ? (
            <div className="space-y-2">
              <Textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={7} aria-label={t("ai.postAsNote")} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await saveSummaryAction(slug, summary.draftId, editing);
                      if (r.ok) {
                        toast({ tone: "success", text: t("common.saved") });
                        setSummary(null);
                        setEditing(null);
                      } else toast({ tone: "error", text: r.error });
                    })
                  }
                >
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <SummaryBody s={summary} />
          )}
        </AiCard>
      ) : null}
      {next ? (
        <AiCard title={t("ai.nextSteps")} provider={next.provider} cached={next.cached} onDismiss={() => dismiss("next_steps")}>
          {next.output.steps.length === 0 ? <p className="text-sm text-fg-2">{t("ai.insufficient")}</p> : null}
          <ol className="space-y-2.5">
            {next.output.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-fg">{s.action}</p>
                  <p className="text-sm text-muted">
                    {t("ai.reason")}: {s.reason}
                  </p>
                </div>
                {staff && taskParent ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t("ai.addAsTask")}
                    onClick={() =>
                      start(async () => {
                        const r = await createTaskAction(slug, { title: s.action.slice(0, 240), requestId: taskParent.requestId ?? null, parentTaskId: taskParent.parentTaskId ?? null, projectId: taskParent.projectId ?? null });
                        toast(r.ok ? { tone: "success", text: t("task.created") } : { tone: "error", text: r.error });
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("ai.addAsTask")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          {next.output.missing.length ? (
            <p className="mt-3 text-sm text-fg-2">
              <span className="font-medium">{t("ai.uncertainties")}:</span> {next.output.missing.join(" · ")}
            </p>
          ) : null}
          <Evidence ids={next.output.steps.flatMap((s) => s.evidence)} labels={next.evidence} />
        </AiCard>
      ) : null}
    </div>
  );
}

function SummaryBody({ s }: { s: Summary }) {
  const { t } = useI18n();
  const o = s.output;
  const rows: [string, string[] | string | null][] = [
    [t("ai.decisions"), o.decisions],
    [t("ai.changes"), o.changes],
    [t("ai.blockers"), o.blockers],
  ];
  return (
    <div className="space-y-2.5 text-[0.9rem] leading-relaxed">
      <p className="text-fg">{o.state}</p>
      {rows.map(([label, v]) =>
        Array.isArray(v) && v.length ? (
          <div key={label}>
            <h4 className="label">{label}</h4>
            <ul className="mt-0.5 list-disc space-y-0.5 ps-5 text-fg-2 marker:text-line-strong">
              {v.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {o.nextAction ? (
        <p className="rounded-md bg-accent-soft px-2.5 py-1.5 text-fg">
          <span className="font-medium">{t("ai.nextAction")}:</span> {o.nextAction}
        </p>
      ) : null}
      {o.insufficient ? <p className="text-sm text-muted">{t("ai.insufficient")}</p> : null}
      <Evidence ids={o.evidence} labels={s.evidence} />
    </div>
  );
}

function summaryText(s: Summary, t: ReturnType<typeof useI18n>["t"]) {
  const o = s.output;
  const parts = [o.state];
  if (o.decisions.length) parts.push(`${t("ai.decisions")}:\n- ${o.decisions.join("\n- ")}`);
  if (o.blockers.length) parts.push(`${t("ai.blockers")}:\n- ${o.blockers.join("\n- ")}`);
  if (o.nextAction) parts.push(`${t("ai.nextAction")}: ${o.nextAction}`);
  return parts.join("\n\n");
}
