"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CircleCheck, Paperclip, Undo2, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { AiCard, AiError, AiTrigger } from "@/components/ai/ai-frame";
import { runAiAction, dismissDraftAction } from "@/app/ai-actions";
import type { ActionResult } from "@/server/action";
import type { AiRunResult } from "@/server/ai/service";
import type { CategoryField } from "@/server/db/schema";
import { formatSize } from "@/components/work/files";
import { CategoryIcon } from "./category-icon";

export type FormCategory = { id: string; key: string; labelEn: string; labelAr: string; helpEn: string; helpAr: string; icon: string; fields: CategoryField[] };
type Brief = AiRunResult<"improve_brief">;

/**
 * The universal request form: five plain questions, 2–4 optional follow-ups for the
 * chosen type, optional AI help. The requester never needs to know internal teams.
 */
export function RequestForm({
  slug,
  categories,
  initialCategory,
  aiEnabled,
  responsePolicy,
  submit,
  requestHref,
  clients,
}: {
  slug: string;
  categories: FormCategory[];
  initialCategory: string | null;
  aiEnabled: boolean;
  responsePolicy: string | null;
  submit: (fd: FormData) => Promise<ActionResult<{ ref: string }>>;
  requestHref: (ref: string) => string;
  clients?: { id: string; name: string }[];
}) {
  const { t, locale } = useI18n();
  const [categoryKey, setCategoryKey] = useState(initialCategory ?? "");
  const category = categories.find((c) => c.key === categoryKey) ?? null;
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // AI brief help
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [qa, setQa] = useState<string[]>([]);
  const [original, setOriginal] = useState<{ title: string; objective: string; details: string; category: string } | null>(null);
  const label = (c: { labelEn: string; labelAr: string }) => (locale === "ar" ? c.labelAr : c.labelEn);

  const visibleFields = useMemo(
    () => (category?.fields ?? []).filter((f) => !f.showWhen || answers[f.showWhen.field] === f.showWhen.equals),
    [category, answers],
  );

  const improve = () => {
    setBriefErr(null);
    setBriefLoading(true);
    start(async () => {
      const r = await runAiAction(slug, "improve_brief", { kind: "brief", title, objective, details, requestedDue: due || null });
      setBriefLoading(false);
      if (!r.ok) return setBriefErr(r.error);
      const b = r.data as Brief;
      setBrief(b);
      setQa(b.output.questions.map(() => ""));
    });
  };
  const applyBrief = () => {
    if (!brief) return;
    setOriginal({ title, objective, details, category: categoryKey });
    const o = brief.output;
    const answered = o.questions.map((q, i) => (qa[i]?.trim() ? `${q}\n→ ${qa[i].trim()}` : null)).filter(Boolean);
    setTitle(o.title);
    setObjective(o.objective);
    setDetails([o.details, ...answered].filter(Boolean).join("\n\n"));
    if (!categoryKey && o.suggestedCategoryKey && categories.some((c) => c.key === o.suggestedCategoryKey)) setCategoryKey(o.suggestedCategoryKey);
    void dismissDraftAction(slug, brief.draftId, true);
    setBrief(null);
  };
  const restore = () => {
    if (!original) return;
    setTitle(original.title);
    setObjective(original.objective);
    setDetails(original.details);
    setCategoryKey(original.category);
    setOriginal(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return; // double-submit guard
    const fd = new FormData(e.currentTarget);
    fd.delete("files");
    for (const f of files) fd.append("files", f);
    start(async () => {
      setFormError(null);
      const r = await submit(fd);
      if (r.ok && r.data) {
        setDone(r.data.ref);
        window.scrollTo({ top: 0 });
      } else if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
      }
    });
  };

  if (done)
    return (
      <div role="status" className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6 text-center shadow-sm sm:p-8">
        <CircleCheck className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">{t("intake.successTitle")}</h1>
        <p className="tnum mt-1 text-2xl font-semibold tracking-wide text-ink">{done}</p>
        <p className="mt-3 text-fg-2">{t("intake.successBody", { ref: done })}</p>
        {responsePolicy ? <p className="mt-1 text-sm text-muted">{t("intake.successResponsePolicy", { policy: responsePolicy })}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={requestHref(done)} className={buttonClass("primary")}>
            {t("intake.viewRequest")}
          </Link>
          <button type="button" className={buttonClass("secondary")} onClick={() => location.reload()}>
            {t("intake.another")}
          </button>
        </div>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" noValidate>
      <div className="space-y-5 rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("intake.chooseType")}</legend>
          <input type="hidden" name="categoryId" value={category?.id ?? ""} />
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={categoryKey === c.key}
                onClick={() => setCategoryKey(categoryKey === c.key ? "" : c.key)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-fg-2 hover:border-line-strong aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-fg"
              >
                <CategoryIcon name={c.icon} className="h-3.5 w-3.5" />
                {label(c)}
              </button>
            ))}
          </div>
        </fieldset>

        {clients?.length ? (
          <Field label={t("common.client")} htmlFor="rf-client">
            <Select id="rf-client" name="clientOrgId" defaultValue="">
              <option value="">{t("common.none")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label={`1. ${t("intake.q1")}`} htmlFor="rf-title" help={t("intake.q1Help")} error={errors.title}>
          <Input id="rf-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} dir="auto" aria-invalid={!!errors.title} />
        </Field>
        <Field label={`2. ${t("intake.q2")}`} htmlFor="rf-objective" help={t("intake.q2Help")} error={errors.objective}>
          <Input id="rf-objective" name="objective" value={objective} onChange={(e) => setObjective(e.target.value)} required maxLength={500} dir="auto" aria-invalid={!!errors.objective} />
        </Field>
        <Field label={`3. ${t("intake.q3")}`} htmlFor="rf-details" help={t("intake.q3Help")} optional optionalLabel={t("common.optional")}>
          <Textarea id="rf-details" name="details" value={details} onChange={(e) => setDetails(e.target.value)} rows={5} maxLength={5000} dir="auto" />
        </Field>

        {aiEnabled ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <AiTrigger label={t("ai.improveBrief")} onClick={improve} loading={briefLoading} disabled={!title.trim() && !objective.trim() && !details.trim()} />
              {original ? (
                <button type="button" onClick={restore} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-2 hover:bg-hover">
                  <Undo2 className="h-3.5 w-3.5 rtl:-scale-x-100" /> {t("ai.restoreOriginal")}
                </button>
              ) : null}
            </div>
            {briefErr ? <AiError message={briefErr} onRetry={improve} /> : null}
            {brief ? (
              <AiCard
                title={t("ai.improveBrief")}
                provider={brief.provider}
                cached={brief.cached}
                onDismiss={() => {
                  void dismissDraftAction(slug, brief.draftId);
                  setBrief(null);
                }}
                actions={
                  <Button size="sm" variant="primary" onClick={applyBrief}>
                    {t("ai.applyAll")}
                  </Button>
                }
              >
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{t("intake.q1")}</dt>
                    <dd className="font-medium text-fg" dir="auto">{brief.output.title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t("intake.q2")}</dt>
                    <dd className="text-fg" dir="auto">{brief.output.objective}</dd>
                  </div>
                  {brief.output.details ? (
                    <div>
                      <dt className="text-xs text-muted">{t("intake.q3")}</dt>
                      <dd className="whitespace-pre-wrap text-fg-2" dir="auto">{brief.output.details}</dd>
                    </div>
                  ) : null}
                  {brief.output.suggestedCategoryKey ? (
                    <div>
                      <dt className="text-xs text-muted">{t("ai.category")}</dt>
                      <dd className="text-fg">{label(categories.find((c) => c.key === brief.output.suggestedCategoryKey) ?? { labelEn: brief.output.suggestedCategoryKey, labelAr: brief.output.suggestedCategoryKey })}</dd>
                    </div>
                  ) : null}
                </dl>
                {brief.output.questions.length ? (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-sm font-medium">{t("ai.questions")}</p>
                    <p className="mb-2 text-xs text-muted">{t("ai.questionsHelp")}</p>
                    <ol className="space-y-2">
                      {brief.output.questions.map((q, i) => (
                        <li key={i}>
                          <label className="block text-sm text-fg" htmlFor={`qa-${i}`} dir="auto">
                            {q}
                          </label>
                          <Input id={`qa-${i}`} value={qa[i] ?? ""} onChange={(e) => setQa((s) => s.map((x, j) => (j === i ? e.target.value : x)))} className="mt-1 h-8 text-sm" dir="auto" />
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </AiCard>
            ) : null}
          </div>
        ) : null}

        <Field label={`4. ${t("intake.q4")}`} htmlFor="rf-due" help={t("intake.q4Help")} error={errors.requestedDueDate}>
          <div className="flex flex-wrap items-center gap-4">
            <Input id="rf-due" name="requestedDueDate" type="date" value={flexible ? "" : due} onChange={(e) => setDue(e.target.value)} disabled={flexible} className="w-44" />
            <Checkbox name="requestedFlexible" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} label={t("intake.flexible")} />
          </div>
        </Field>

        <Field label={`5. ${t("intake.q5")}`} htmlFor="rf-files" help={t("intake.q5Help")} optional optionalLabel={t("common.optional")}>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-fg-2 hover:text-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <Paperclip className="h-4 w-4" /> {t("common.add")}
              <input
                id="rf-files"
                type="file"
                multiple
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.mp4,.zip"
                onChange={(e) => setFiles((s) => [...s, ...Array.from(e.target.files ?? [])].slice(0, 10))}
              />
            </label>
            {files.length ? (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="truncate" dir="auto">{f.name}</span>
                    <span className="tnum text-xs text-muted">{formatSize(f.size)}</span>
                    <button type="button" onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} aria-label={`${t("common.remove")} ${f.name}`} className="rounded p-0.5 text-muted hover:bg-hover">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>
        <Field label={t("intake.link")} htmlFor="rf-link" error={errors.linkUrl}>
          <Input id="rf-link" name="linkUrl" type="url" inputMode="url" placeholder="https://" dir="ltr" />
        </Field>

        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending && !briefLoading}>
            {pending && !briefLoading ? t("intake.submitting") : t("intake.submit")}
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        {category && category.fields.length ? (
          <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-1 font-medium">{t("intake.moreQuestions")}</h2>
            <p className="mb-3 text-sm text-muted">{locale === "ar" ? category.helpAr : category.helpEn}</p>
            <div className="space-y-3">
              {visibleFields.map((f) => (
                <Field key={f.key} label={label(f)} htmlFor={`ans-${f.key}`} optional optionalLabel={t("common.optional")}>
                  {f.type === "select" ? (
                    <Select id={`ans-${f.key}`} name={`answer_${f.key}`} value={answers[f.key] ?? ""} onChange={(e) => setAnswers((s) => ({ ...s, [f.key]: e.target.value }))}>
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {label(o)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={`ans-${f.key}`}
                      name={`answer_${f.key}`}
                      type={f.type === "date" ? "date" : "text"}
                      value={answers[f.key] ?? ""}
                      onChange={(e) => setAnswers((s) => ({ ...s, [f.key]: e.target.value }))}
                      maxLength={500}
                      dir="auto"
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        ) : null}
        <p className="text-sm text-muted">{t("intake.q4Help")}</p>
      </aside>
    </form>
  );
}
