"use client";
import { useState, useTransition } from "react";
import { CalendarClock, Check, MessageCircleQuestion, PackageCheck, Paperclip, Play, RotateCcw, X, Archive } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { formatSize } from "@/components/work/files";
import {
  acceptRequestAction,
  changeCommitmentAction,
  closeRequestAction,
  declineRequestAction,
  deliverAction,
  linkProjectAction,
  reopenRequestAction,
  requestInfoAction,
  setRequestStatusAction,
} from "@/app/w/[slug]/actions";
import type { InternalRequestStatus } from "@/server/db/schema";

type Person = { id: string; name: string };

/** Compact decision panel: Accept (owner + committed date) / Need info / Decline. */
export function TriagePanel({
  slug,
  requestId,
  people,
  projects,
  defaultOwnerId,
  requestedDueDate,
}: {
  slug: string;
  requestId: string;
  people: Person[];
  projects: { id: string; name: string }[];
  defaultOwnerId: string | null;
  requestedDueDate: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [mode, setMode] = useState<"accept" | "info" | "decline">("accept");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flexible, setFlexible] = useState(false);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    start(async () => {
      const r =
        mode === "accept"
          ? await acceptRequestAction(slug, requestId, f)
          : mode === "info"
            ? await requestInfoAction(slug, requestId, f.question ?? "")
            : await declineRequestAction(slug, requestId, f);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast({ tone: "error", text: r.error });
      }
    });
  };
  const tabs = [
    ["accept", t("request.accept"), <Check key="a" className="h-3.5 w-3.5" />],
    ["info", t("request.needInfo"), <MessageCircleQuestion key="i" className="h-3.5 w-3.5" />],
    ["decline", t("request.decline"), <X key="d" className="h-3.5 w-3.5" />],
  ] as const;
  return (
    <section className="rounded-lg border border-accent/30 bg-surface shadow-sm" aria-labelledby="triage-h">
      <div className="border-b border-line px-4 py-3">
        <h2 id="triage-h" className="font-semibold">
          {t("request.triageTitle")}
        </h2>
        <p className="text-sm text-muted">{t("request.triageHelp")}</p>
      </div>
      <div role="tablist" className="flex gap-1 px-3 pt-3">
        {tabs.map(([k, label, icon]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-2 hover:bg-hover aria-selected:bg-brand-soft aria-selected:font-medium aria-selected:text-fg"
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3 p-4" key={mode}>
        {mode === "accept" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.owner")} htmlFor="tr-owner" error={errors.ownerId}>
                <Select id="tr-owner" name="ownerId" defaultValue={defaultOwnerId ?? ""} required>
                  <option value="">—</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("request.committedDate")} htmlFor="tr-date" error={errors.committedDueDate}>
                <Input id="tr-date" name="committedDueDate" type="date" defaultValue={requestedDueDate ?? ""} disabled={flexible} />
              </Field>
            </div>
            <Checkbox name="committedFlexible" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} label={t("request.commitFlexible")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("request.priority")} htmlFor="tr-pri">
                <Select id="tr-pri" name="priority" defaultValue="normal">
                  <option value="normal">{t("request.priorityNormal")}</option>
                  <option value="high">{t("request.priorityHigh")}</option>
                </Select>
              </Field>
              <Field label={t("request.linkProject")} htmlFor="tr-proj">
                <Select id="tr-proj" name="projectId" defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t("request.publicNote")} htmlFor="tr-note" optional optionalLabel={t("common.optional")}>
              <Textarea id="tr-note" name="note" rows={2} maxLength={4000} dir="auto" />
            </Field>
          </>
        ) : mode === "info" ? (
          <Field label={t("request.question")} htmlFor="tr-q" help={t("request.publicNote")} error={errors._}>
            <Textarea id="tr-q" name="question" rows={3} required maxLength={2000} placeholder={t("request.questionPlaceholder")} dir="auto" />
          </Field>
        ) : (
          <>
            <Field label={t("request.declineReasonPublic")} htmlFor="tr-rp" error={errors.reasonPublic}>
              <Textarea id="tr-rp" name="reasonPublic" rows={2} required maxLength={1000} dir="auto" />
            </Field>
            <Field label={t("request.declineReasonInternal")} htmlFor="tr-ri" optional optionalLabel={t("common.optional")}>
              <Textarea id="tr-ri" name="reasonInternal" rows={2} maxLength={2000} dir="auto" />
            </Field>
          </>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant={mode === "decline" ? "danger" : "primary"} loading={pending}>
            {tabs.find((x) => x[0] === mode)![1]}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** One primary next action per state; secondary actions stay quiet. */
export function WorkActions({
  slug,
  requestId,
  status,
  canWork,
  canDeliver,
  nextVersion,
  approvalsEnabled,
}: {
  slug: string;
  requestId: string;
  status: InternalRequestStatus;
  canWork: boolean;
  canDeliver: boolean;
  nextVersion: number;
  approvalsEnabled: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (!canWork) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast({ tone: "error", text: r.error ?? "" });
    });
  const deliver = canDeliver && ["accepted", "in_progress", "in_review", "ready_to_deliver", "delivered"].includes(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "accepted" ? (
        <Button variant="primary" loading={pending} onClick={() => run(() => setRequestStatusAction(slug, requestId, "in_progress"))}>
          <Play className="h-4 w-4 rtl:-scale-x-100" /> {t("request.startWork")}
        </Button>
      ) : null}
      {status === "in_progress" || status === "in_review" ? (
        <Button loading={pending} onClick={() => run(() => setRequestStatusAction(slug, requestId, "ready_to_deliver"))}>
          <PackageCheck className="h-4 w-4" /> {t("request.readyToDeliver")}
        </Button>
      ) : null}
      {deliver ? <DeliverDialog slug={slug} requestId={requestId} version={nextVersion} primary={status !== "accepted"} approvalsEnabled={approvalsEnabled} /> : null}
      {status === "delivered" ? (
        <Button variant="ghost" loading={pending} onClick={() => run(() => closeRequestAction(slug, requestId))}>
          <Archive className="h-4 w-4" /> {t("request.close")}
        </Button>
      ) : null}
      {status === "delivered" || status === "closed" ? <ReasonDialog label={t("request.reopen")} icon={<RotateCcw className="h-4 w-4" />} onSubmit={(reason) => reopenRequestAction(slug, requestId, reason)} /> : null}
    </div>
  );
}

function ReasonDialog({ label, icon, onSubmit }: { label: string; icon: React.ReactNode; onSubmit: (reason: string) => Promise<{ ok: boolean; error?: string }> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          {icon} {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={label} closeLabel={t("common.close")}>
        <Field label={t("request.changeReason")} htmlFor="reason" help={t("request.publicNote")} error={err}>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} dir="auto" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!reason.trim()}
            onClick={() =>
              start(async () => {
                const r = await onSubmit(reason);
                if (r.ok) setOpen(false);
                else setErr(r.error ?? null);
              })
            }
          >
            {t("common.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Explicit, versioned delivery. Requires a file, link or note. Sends one notification. */
export function DeliverDialog({ slug, requestId, version, primary, approvalsEnabled }: { slug: string; requestId: string; version: number; primary: boolean; approvalsEnabled: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={primary ? "primary" : "secondary"}>
          <PackageCheck className="h-4 w-4" /> {version > 1 ? `${t("deliver.newVersion")} (v${version})` : t("request.deliver")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("deliver.title")} description={t("deliver.help")} closeLabel={t("common.close")}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            const fd = new FormData(e.currentTarget);
            fd.delete("files");
            for (const f of files) fd.append("files", f);
            start(async () => {
              const r = await deliverAction(slug, requestId, fd);
              if (r.ok) {
                setOpen(false);
                setFiles([]);
                toast({ tone: "success", text: t("deliver.sent") });
              } else setErr({ ...(r.fieldErrors ?? {}), _: r.error });
            });
          }}
        >
          <Field label={t("deliver.versionTitle")} htmlFor="dl-title" error={err.title}>
            <Input id="dl-title" name="title" required maxLength={200} dir="auto" />
          </Field>
          <Field label={t("deliver.note")} htmlFor="dl-note" help={t("request.publicNote")}>
            <Textarea id="dl-note" name="note" rows={3} maxLength={4000} dir="auto" />
          </Field>
          <Field label={t("deliver.link")} htmlFor="dl-link" error={err.linkUrl} optional optionalLabel={t("common.optional")}>
            <Input id="dl-link" name="linkUrl" type="url" placeholder="https://" dir="ltr" />
          </Field>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-fg-2 hover:text-fg">
              <Paperclip className="h-4 w-4" /> {t("deliver.files")}
              <input type="file" multiple className="sr-only" onChange={(e) => setFiles((s) => [...s, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
            </label>
            {files.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {files.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-muted">{formatSize(f.size)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {approvalsEnabled ? <Checkbox name="requestApproval" defaultChecked label={t("deliver.requireApproval")} /> : null}
          {err._ ? <p className="text-sm text-danger">{err._}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("deliver.confirm", { n: version })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CommitmentDialog({ slug, requestId, current, flexible }: { slug: string; requestId: string; current: string | null; flexible: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [flex, setFlex] = useState(flexible);
  const [err, setErr] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          <CalendarClock className="h-3.5 w-3.5" /> {t("request.changeCommitment")}
        </button>
      </DialogTrigger>
      <DialogContent title={t("request.changeCommitment")} description={t("request.changeReasonHelp")} closeLabel={t("common.close")}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            start(async () => {
              const r = await changeCommitmentAction(slug, requestId, f);
              if (r.ok) setOpen(false);
              else setErr({ ...(r.fieldErrors ?? {}), _: r.error });
            });
          }}
        >
          <Field label={t("request.committedDate")} htmlFor="cm-date" error={err.committedDueDate}>
            <Input id="cm-date" name="committedDueDate" type="date" defaultValue={current ?? ""} disabled={flex} />
          </Field>
          <Checkbox name="committedFlexible" checked={flex} onChange={(e) => setFlex(e.target.checked)} label={t("request.commitFlexible")} />
          <Field label={t("request.changeReason")} htmlFor="cm-reason" help={t("request.publicNote")} error={err.reason}>
            <Textarea id="cm-reason" name="reason" rows={2} required maxLength={1000} dir="auto" />
          </Field>
          {err._ ? <p className="text-sm text-danger">{err._}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectLink({ slug, requestId, projects, value }: { slug: string; requestId: string; projects: { id: string; name: string }[]; value: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const [, start] = useTransition();
  return (
    <Select
      aria-label={t("request.linkProject")}
      defaultValue={value ?? ""}
      className="h-8 text-sm"
      onChange={(e) =>
        start(async () => {
          const r = await linkProjectAction(slug, requestId, e.target.value || null);
          if (!r.ok) toast({ tone: "error", text: r.error });
        })
      }
    >
      <option value="">{t("common.none")}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}
