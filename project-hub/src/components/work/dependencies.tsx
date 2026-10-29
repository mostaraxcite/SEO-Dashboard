"use client";
import { useState, useTransition } from "react";
import { Ban, CircleCheck, Hourglass, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/status";
import { createDependencyAction, resolveDependencyAction } from "@/app/w/[slug]/actions";
import { DueLabel } from "./due";

export type DepItem = {
  id: string;
  title: string;
  partyType: string;
  partyName: string;
  ownerName: string | null;
  dueDate: string | null;
  impact: string;
  blocking: boolean;
  status: string;
};

/** Things needed from another team, department, the client or an outside party — each with an accountable party and date. */
export function Dependencies({
  slug,
  deps,
  today,
  requestId,
  taskId,
  people,
  canEdit = true,
}: {
  slug: string;
  deps: DepItem[];
  today: string;
  requestId?: string | null;
  taskId?: string | null;
  people: { id: string; name: string }[];
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {deps.length === 0 ? <p className="text-sm text-muted">{t("dependency.none")}</p> : null}
      <ul className="space-y-2">
        {deps.map((d) => {
          const open = d.status === "open";
          return (
            <li key={d.id} id={`dep-${d.id}`} className="rounded-md border border-line p-2.5 target:bg-accent-soft/60">
              <div className="flex flex-wrap items-center gap-2">
                {open ? (
                  <Pill tone={d.blocking ? "danger" : "warning"} icon={d.blocking ? <Ban /> : <Hourglass />}>
                    {t("dependency.waitingOn", { party: d.partyName })}
                  </Pill>
                ) : (
                  <Pill tone="success" icon={<CircleCheck />}>
                    {t("dependency.resolved")}
                  </Pill>
                )}
                <span className="text-xs text-muted">{t(`dependency.types.${d.partyType}` as never)}</span>
                <span className="ms-auto">{open ? <DueLabel date={d.dueDate} today={today} /> : null}</span>
              </div>
              <p className={`mt-1.5 ${open ? "text-fg" : "text-muted line-through"}`} dir="auto">
                {d.title}
              </p>
              {d.impact ? <p className="text-sm text-fg-2" dir="auto">{t("dependency.impact")}: {d.impact}</p> : null}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {t("dependency.owner")}: {d.ownerName ?? "—"}
                </span>
                {open && canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await resolveDependencyAction(slug, d.id);
                        if (!r.ok) toast({ tone: "error", text: r.error });
                      })
                    }
                  >
                    <CircleCheck className="h-3.5 w-3.5" /> {t("dependency.resolve")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {canEdit ? <AddDependency slug={slug} requestId={requestId} taskId={taskId} people={people} /> : null}
    </div>
  );
}

function AddDependency({ slug, requestId, taskId, people }: { slug: string; requestId?: string | null; taskId?: string | null; people: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="h-3.5 w-3.5" /> {t("dependency.add")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("dependency.add")} closeLabel={t("common.close")}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            start(async () => {
              const r = await createDependencyAction(slug, { ...f, requestId: requestId ?? null, taskId: taskId ?? null });
              if (r.ok) setOpen(false);
              else setError(r.fieldErrors ?? { _: r.error });
            });
          }}
        >
          <Field label={t("dependency.title")} htmlFor="dep-title" error={error.title}>
            <Input id="dep-title" name="title" required maxLength={200} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("dependency.partyType")} htmlFor="dep-type">
              <Select id="dep-type" name="partyType" defaultValue="department">
                {(["team", "department", "client", "external"] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`dependency.types.${v}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("dependency.party")} htmlFor="dep-party" error={error.partyName}>
              <Input id="dep-party" name="partyName" required maxLength={120} placeholder="Procurement" />
            </Field>
            <Field label={t("dependency.owner")} htmlFor="dep-owner">
              <Select id="dep-owner" name="ownerId" defaultValue="">
                <option value="">{t("common.none")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("dependency.due")} htmlFor="dep-due">
              <Input id="dep-due" name="dueDate" type="date" />
            </Field>
          </div>
          <Field label={t("dependency.impact")} htmlFor="dep-impact" optional optionalLabel={t("common.optional")}>
            <Textarea id="dep-impact" name="impact" rows={2} maxLength={1000} />
          </Field>
          <Checkbox name="blocking" defaultChecked label={t("dependency.blocking")} />
          {error._ ? <p className="text-sm text-danger">{error._}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("common.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
