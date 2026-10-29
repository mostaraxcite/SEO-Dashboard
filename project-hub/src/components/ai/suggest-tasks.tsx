"use client";
import { useState, useTransition } from "react";
import { ArrowDownRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { runAiAction, dismissDraftAction, applyTasksAction } from "@/app/ai-actions";
import type { AiRunResult, AiTarget } from "@/server/ai/service";
import { AiCard, AiError, AiTrigger } from "./ai-frame";

type Draft = AiRunResult<"suggest_tasks">;
type Row = { include: boolean; title: string; description: string; teamLabel: string; assigneeId: string; dueDate: string; dependsOn: number[] };

/**
 * Suggest 3–8 editable tasks. Nothing is created until "Review & create";
 * the server re-checks permissions and rejects stale suggestions.
 */
export function SuggestTasks({ slug, target, people }: { slug: string; target: AiTarget; people: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    setLoading(true);
    start(async () => {
      const r = await runAiAction(slug, "suggest_tasks", target);
      setLoading(false);
      if (!r.ok) return setError(r.error);
      const d = r.data as Draft;
      setDraft(d);
      setRows(d.output.suggestions.map((s) => ({ include: true, title: s.title, description: s.description, teamLabel: s.proposedTeam ?? "", assigneeId: "", dueDate: "", dependsOn: s.dependsOn })));
    });
  };
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.include && r.title.trim());
  const create = () =>
    start(async () => {
      if (!draft) return;
      const res = await applyTasksAction(slug, {
        draftId: draft.draftId,
        tasks: selected.map((r) => {
          const after = r.dependsOn.map((d) => rows[d]?.title).filter(Boolean);
          return { title: r.title, description: [r.description, after.length ? `↳ ${t("ai.dependsOn", { n: r.dependsOn.map((d) => d + 1).join(", ") })}: ${after.join(", ")}` : ""].filter(Boolean).join("\n\n"), teamLabel: r.teamLabel, assigneeId: r.assigneeId, dueDate: r.dueDate };
        }),
      });
      if (res.ok) {
        toast({ tone: "success", text: t("ai.createSelected", { n: selected.length }) + " ✓" });
        setDraft(null);
      } else setError(res.error);
    });

  return (
    <div className="space-y-3">
      {!draft ? <AiTrigger label={t("ai.suggestTasks")} onClick={run} loading={loading} /> : null}
      {error ? <AiError message={error} onRetry={run} /> : null}
      {draft ? (
        <AiCard
          title={t("ai.reviewCreate")}
          provider={draft.provider}
          cached={draft.cached}
          onDismiss={() => {
            void dismissDraftAction(slug, draft.draftId);
            setDraft(null);
          }}
          actions={
            <Button variant="primary" size="sm" onClick={create} loading={pending} disabled={!selected.length}>
              {t("ai.createSelected", { n: selected.length })}
            </Button>
          }
        >
          <p className="mb-3 text-sm text-muted">{t("ai.noDates")}</p>
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className={`rounded-md border border-line p-2.5 ${r.include ? "" : "opacity-55"}`}>
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => update(i, { include: e.target.checked })}
                    className="mt-2 h-4 w-4 accent-[color:var(--brand)]"
                    aria-label={`${t("common.add")}: ${r.title}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="tnum text-xs text-muted">#{i + 1}</span>
                      <Input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label={t("common.title")} className="h-8 font-medium" />
                    </div>
                    {r.description ? <p className="text-sm text-fg-2">{r.description}</p> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {r.dependsOn.length ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <ArrowDownRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                          {t("ai.dependsOn", { n: r.dependsOn.map((d) => d + 1).join(", ") })}
                        </span>
                      ) : null}
                      <Input value={r.teamLabel} onChange={(e) => update(i, { teamLabel: e.target.value })} placeholder={t("ai.proposedTeam")} aria-label={t("ai.proposedTeam")} className="h-8 w-36 text-sm" />
                      <Select value={r.assigneeId} onChange={(e) => update(i, { assigneeId: e.target.value })} aria-label={t("task.assignee")} className="h-8 w-40 text-sm">
                        <option value="">{t("common.unassigned")}</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <Input type="date" value={r.dueDate} onChange={(e) => update(i, { dueDate: e.target.value })} aria-label={t("task.dueDate")} className="h-8 w-36 text-sm" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {draft.output.uncertainties.length ? (
            <p className="mt-3 text-sm text-fg-2">
              <span className="font-medium">{t("ai.uncertainties")}:</span> {draft.output.uncertainties.join(" · ")}
            </p>
          ) : null}
        </AiCard>
      ) : null}
    </div>
  );
}
