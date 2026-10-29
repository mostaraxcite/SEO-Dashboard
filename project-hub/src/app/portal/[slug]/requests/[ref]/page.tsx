import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, MessageCircleQuestion, PackageCheck } from "lucide-react";
import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getRequestForClient } from "@/server/services/requests";
import { signedFileUrl } from "@/server/services/files";
import { aiEnabledFor } from "@/server/services/settings";
import { AppError } from "@/server/errors";
import { formatDay, formatDateTime } from "@/i18n";
import { Panel, PanelHeader, Meta } from "@/components/ui/misc";
import { Pill, publicStatusMeta } from "@/components/ui/status";
import { StatusSteps } from "@/components/portal/status-steps";
import { ApprovalPanel } from "@/components/portal/approval-panel";
import { ClientThread } from "./client-thread";
import { FileList } from "@/components/work/files";
import { Timeline } from "@/components/work/timeline";
import { AiAssist } from "@/components/ai/ai-assist";

export default async function PortalRequest({ params }: { params: Promise<{ slug: string; ref: string }> }) {
  const { slug, ref } = await params;
  const actor = await requireClient(slug);
  const { t, locale } = await getI18n();
  const r = await getRequestForClient(actor, decodeURIComponent(ref)).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const ai = await aiEnabledFor(actor);
  const meta = publicStatusMeta[r.publicStatus];
  const fileUrl = (f: { id: string; filename: string; size: number; mime: string }) => ({ ...f, url: signedFileUrl(slug, f.id, actor.user.id) });
  const latest = r.deliverables[0];
  const expected = r.committedDueDate ? formatDay(r.committedDueDate, locale, { year: "numeric", weekday: "short" }) : r.committedFlexible ? t("common.flexible") : t("portal.expectedPending");

  return (
    <div className="space-y-6">
      <Link href={`/portal/${slug}/requests`} className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.myRequests")}
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum text-sm text-muted">{r.publicRef}</span>
          <Pill tone={meta.tone} icon={meta.icon}>
            {t(`request.public.${r.publicStatus}`)}
          </Pill>
        </div>
        <h1 className="text-xl font-semibold" dir="auto">
          {r.title}
        </h1>
        <StatusSteps internal={r.status} t={t} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {r.pendingQuestion ? (
            <section className="rounded-lg border border-warning/40 bg-warning-soft p-4" aria-labelledby="q-h">
              <h2 id="q-h" className="flex items-center gap-2 font-medium text-warning">
                <MessageCircleQuestion className="h-4 w-4" /> {t("portal.waitingOnYou")}
              </h2>
              <p className="mt-1.5 text-fg" dir="auto">
                {r.pendingQuestion}
              </p>
              <p className="mt-1 text-sm text-fg-2">↓ {t("portal.answerQuestion")}</p>
            </section>
          ) : null}

          {latest ? (
            <Panel aria-labelledby="deliv-h">
              <PanelHeader
                title={
                  <span id="deliv-h" className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-success" /> {t("portal.delivered")} · {t("portal.version", { n: latest.version })}
                  </span>
                }
                description={latest.deliveredAt ? formatDateTime(latest.deliveredAt, locale, actor.tenant.timezone) : undefined}
              />
              <div className="space-y-3 p-4">
                <p className="font-medium" dir="auto">{latest.title}</p>
                {latest.note ? <p className="whitespace-pre-wrap text-fg-2" dir="auto">{latest.note}</p> : null}
                {latest.linkUrl ? (
                  <a href={latest.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline" dir="ltr">
                    {latest.linkUrl} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <FileList files={latest.files.map(fileUrl)} />
                {r.pendingApproval && r.pendingApproval.deliverableId === latest.id ? (
                  <div className="border-t border-line pt-3">
                    <p className="mb-2 text-sm text-fg-2">{t("portal.approvalsTitle")}</p>
                    <ApprovalPanel slug={slug} approvalId={r.pendingApproval.id} version={latest.version} canApprove={actor.canApprove} />
                  </div>
                ) : latest.status === "approved" ? (
                  <p className="text-sm font-medium text-success">{t("portal.approved")}</p>
                ) : latest.status === "changes_requested" ? (
                  <p className="text-sm font-medium text-warning">{t("portal.changesRequested")}</p>
                ) : null}
                {r.status === "delivered" && r.reviewWindowEndsAt ? (
                  <p className="text-xs text-muted">
                    {t("portal.autoClose", { date: formatDay(r.reviewWindowEndsAt, locale, { year: "numeric" }) })}
                  </p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {ai.summarize ? <AiAssist slug={slug} target={{ kind: "request", ref: r.publicRef }} staff={false} allowNextSteps={false} /> : null}

          <Panel>
            <PanelHeader title={t("request.conversation")} />
            <ClientThread
              slug={slug}
              requestId={r.id}
              items={r.messages.map((m) => ({ id: m.id, body: m.body, authorName: m.authorName, createdAt: m.createdAt.toISOString(), kind: m.kind }))}
              closed={["closed", "declined"].includes(r.status)}
              answering={!!r.pendingQuestion}
            />
          </Panel>

          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 text-sm font-medium text-muted">
              {t("portal.history")}
            </h2>
            <Timeline events={r.timeline} t={t} locale={locale} timeZone={actor.tenant.timezone} statusNs="request.public" />
          </section>
        </div>

        <aside className="space-y-4">
          <Panel className="px-4 py-3">
            <dl>
              <Meta label={t("portal.expected")}>{expected}</Meta>
              <Meta label={t("request.requestedDate")}>{r.requestedDueDate ? formatDay(r.requestedDueDate, locale, { year: "numeric" }) : t("common.flexible")}</Meta>
              <Meta label={t("portal.pointOfContact")}>{r.ownerName ?? "—"}</Meta>
              <Meta label={t("intake.requestedBy")}>{r.requesterName}</Meta>
              {r.categoryEn ? <Meta label={t("request.category")}>{locale === "ar" ? r.categoryAr : r.categoryEn}</Meta> : null}
            </dl>
          </Panel>
          <Panel className="space-y-3 px-4 py-3">
            <div>
              <h2 className="text-sm text-muted">{t("request.objective")}</h2>
              <p className="mt-0.5" dir="auto">{r.objective}</p>
            </div>
            {r.details ? (
              <div>
                <h2 className="text-sm text-muted">{t("request.details")}</h2>
                <p className="mt-0.5 whitespace-pre-wrap text-fg-2" dir="auto">{r.details}</p>
              </div>
            ) : null}
            {r.files.length ? (
              <div>
                <h2 className="text-sm text-muted">{t("request.attachments")}</h2>
                <FileList files={r.files.map(fileUrl)} />
              </div>
            ) : null}
            {r.declineReason ? <p className="rounded-md bg-neutral-soft px-3 py-2 text-sm" dir="auto">{r.declineReason}</p> : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
