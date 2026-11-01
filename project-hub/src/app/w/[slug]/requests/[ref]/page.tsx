import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Eye, Lock } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getRequestForStaff } from "@/server/services/requests";
import { listTasks } from "@/server/services/tasks";
import { listStaff } from "@/server/services/people";
import { projectOptions } from "@/server/services/projects";
import { signedFileUrl } from "@/server/services/files";
import { aiEnabledFor } from "@/server/services/settings";
import { isManager } from "@/server/authz";
import { AppError } from "@/server/errors";
import { formatDay, formatDateTime, todayIn } from "@/i18n";
import { Panel, PanelHeader, Meta, Ref } from "@/components/ui/misc";
import { Pill, requestStatusMeta } from "@/components/ui/status";
import { TabLink } from "@/components/shell/nav-link";
import { TaskList } from "@/components/work/task-list";
import { QuickAddTask } from "@/components/work/quick-add";
import { Timeline } from "@/components/work/timeline";
import { FileList } from "@/components/work/files";
import { Dependencies } from "@/components/work/dependencies";
import { SlaPill } from "@/components/requests/sla";
import { TriagePanel, WorkActions, CommitmentDialog, ProjectLink } from "@/components/requests/request-controls";
import { StaffThreads } from "./threads";
import { AiAssist } from "@/components/ai/ai-assist";
import { SuggestTasks } from "@/components/ai/suggest-tasks";

export default async function StaffRequestPage({ params, searchParams }: { params: Promise<{ slug: string; ref: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug, ref } = await params;
  const { tab: tabParam } = await searchParams;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const r = await getRequestForStaff(actor, decodeURIComponent(ref)).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [tasks, people, projects, ai] = await Promise.all([listTasks(actor, { requestId: r.id }), listStaff(actor), projectOptions(actor), aiEnabledFor(actor)]);
  const today = todayIn(actor.tenant.timezone);
  const tab = tabParam === "conversation" || tabParam === "work" ? tabParam : "overview";
  const base = `/w/${slug}/requests/${r.publicRef}`;
  const meta = requestStatusMeta[r.status];
  const triage = ["new", "triage", "needs_info"].includes(r.status);
  const fileUrl = (f: { id: string; filename: string; size: number; mime: string }) => ({ ...f, url: signedFileUrl(slug, f.id, actor.user.id) });
  const projectChoices = projects.filter((p) => (p.clientOrgId ?? null) === (r.clientOrgId ?? null));
  const internal = actor.tenant.kind === "internal";
  const canDeliver = isManager(actor) || (r.ownerId === actor.user.id && !actor.tenant.features.requireApprovalToDeliver);
  const nextVersion = (r.deliverables[0]?.version ?? 0) + 1;
  const slaFirst = r.sla.find((s) => s.metric === "first_response");
  const slaTriage = r.sla.find((s) => s.metric === "triage");
  const answers = Object.entries(r.answers ?? {}).map(([k, v]) => {
    const f = r.formSnapshot?.fields.find((x) => x.key === k);
    const opt = f?.options?.find((o) => o.value === v);
    return { label: f ? (locale === "ar" ? f.labelAr : f.labelEn) : k, value: opt ? (locale === "ar" ? opt.labelAr : opt.labelEn) : v };
  });

  return (
    <div className="space-y-5">
      <Link href={`/w/${slug}/inbox?tab=all`} className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("inbox.title")}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Ref strong className="text-[0.8125rem]">{r.publicRef}</Ref>
            <Pill tone={meta.tone} icon={meta.icon}>
              {t(`request.internal.${r.status}`)}
            </Pill>
            {r.priority === "high" ? <Pill tone="danger">{t("request.priorityHigh")}</Pill> : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted" title={t("request.publicNote")}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {t(`request.public.${r.publicStatus}`)}
              <span className="sr-only">({t("request.publicNote")})</span>
            </span>
          </div>
          <h1 className="text-xl font-semibold" dir="auto">
            {r.title}
          </h1>
          <p className="text-sm text-fg-2">
            {r.clientName ? <span className="font-medium text-fg">{r.clientName}</span> : null}
            {r.clientName ? " · " : ""}
            {t("intake.requestedBy")} {r.requesterName}
            {r.categoryEn ? ` · ${locale === "ar" ? r.categoryAr : r.categoryEn}` : ""}
          </p>
        </div>
        <WorkActions slug={slug} requestId={r.id} status={r.status} canWork={r.canWork} canDeliver={canDeliver} nextVersion={nextVersion} approvalsEnabled={actor.tenant.features.approvals} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {triage && r.canTriage && r.status !== "needs_info" ? (
            <TriagePanel slug={slug} requestId={r.id} people={people} projects={projectChoices} defaultOwnerId={r.ownerId} requestedDueDate={r.requestedDueDate} />
          ) : null}
          {r.status === "needs_info" ? (
            <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
              <span className="font-medium">{t("request.pendingQuestion")}:</span> <span dir="auto">{r.pendingQuestion}</span>
            </p>
          ) : null}

          <nav className="flex gap-5 border-b border-line" aria-label={t("request.request")}>
            <TabLink href={`${base}?tab=overview`} label={t("request.overview")} isDefault />
            <TabLink href={`${base}?tab=conversation`} label={t("request.conversation")} count={r.messages.length} />
            <TabLink href={`${base}?tab=work`} label={t("request.internalWork")} count={tasks.length} />
          </nav>

          {tab === "overview" ? (
            <>
              <Panel className="space-y-4 p-4">
                <div>
                  <h2 className="text-sm text-muted">{t("request.objective")}</h2>
                  <p className="mt-0.5 text-fg" dir="auto">{r.objective}</p>
                </div>
                {r.details ? (
                  <div>
                    <h2 className="text-sm text-muted">{t("request.details")}</h2>
                    <p className="mt-0.5 whitespace-pre-wrap text-fg-2" dir="auto">{r.details}</p>
                  </div>
                ) : null}
                {answers.length ? (
                  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {answers.map((a) => (
                      <div key={a.label}>
                        <dt className="text-sm text-muted">{a.label}</dt>
                        <dd dir="auto">{a.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {r.linkUrl ? (
                  <a href={r.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline" dir="ltr">
                    {r.linkUrl} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {r.files.length ? (
                  <div>
                    <h2 className="mb-1 text-sm text-muted">{t("request.attachments")}</h2>
                    <FileList files={r.files.map(fileUrl)} />
                  </div>
                ) : null}
              </Panel>
              {r.deliverables.length ? (
                <Panel>
                  <PanelHeader title={t("deliver.history")} />
                  <ul className="divide-y divide-line">
                    {r.deliverables.map((d) => (
                      <li key={d.id} className="space-y-1.5 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t("portal.version", { n: d.version })}</span>
                          <Pill tone={d.status === "approved" ? "success" : d.status === "changes_requested" ? "warning" : d.status === "superseded" ? "neutral" : "info"}>
                            {d.status === "approved" ? t("portal.approved") : d.status === "changes_requested" ? t("portal.changesRequested") : d.status === "superseded" ? "—" : t("portal.delivered")}
                          </Pill>
                          <span className="ms-auto text-xs text-muted">{d.deliveredAt ? formatDateTime(d.deliveredAt, locale, actor.tenant.timezone) : ""}</span>
                        </div>
                        <p dir="auto">{d.title}</p>
                        <FileList files={d.files.map(fileUrl)} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
              <section>
                <h2 className="mb-3 text-sm font-medium text-muted">{t("request.timeline")}</h2>
                <Timeline events={r.timeline} t={t} locale={locale} timeZone={actor.tenant.timezone} statusNs="request.internal" />
              </section>
            </>
          ) : null}

          {tab === "conversation" || tab === "work" ? (
            <StaffThreads
              slug={slug}
              requestId={r.id}
              tab={tab}
              messages={r.messages.map((m) => ({ id: m.id, body: m.body, authorName: m.authorName, createdAt: m.createdAt.toISOString(), kind: m.kind }))}
              notes={r.notes.map((n) => ({ id: n.id, body: n.body, authorName: n.authorName, createdAt: n.createdAt.toISOString() }))}
              closed={["closed", "declined"].includes(r.status)}
            />
          ) : null}

          {tab === "work" ? (
            <div className="space-y-5">
              <Panel>
                <PanelHeader
                  title={t("request.tasksForRequest")}
                  description={
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> {t("task.internalOnly")}
                    </span>
                  }
                  actions={ai.suggest_tasks && r.canWork && !triage ? <SuggestTasks slug={slug} target={{ kind: "request", ref: r.publicRef }} people={people} /> : null}
                />
                <TaskList slug={slug} tasks={tasks} today={today} showContext={false} empty={<p className="px-4 py-3 text-sm text-muted">{t("request.noTasks")}</p>} />
                <div className="border-t border-line">
                  <QuickAddTask slug={slug} requestId={r.id} projectId={r.projectId} people={people} />
                </div>
              </Panel>
              <Panel>
                <PanelHeader title={t("request.dependencies")} />
                <div className="p-3">
                  <Dependencies slug={slug} deps={r.dependencies} today={today} requestId={r.id} people={people} />
                </div>
              </Panel>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Panel className="px-4 py-3">
            <dl>
              <Meta label={internal ? t("common.department") : t("common.client")}>{r.clientName ?? "—"}</Meta>
              <Meta label={t("common.owner")}>{r.ownerName ?? <span className="text-muted">{t("common.unassigned")}</span>}</Meta>
              <Meta label={t("request.requestedDate")}>{r.requestedDueDate ? formatDay(r.requestedDueDate, locale, { year: "numeric" }) : t("common.flexible")}</Meta>
              <Meta label={t("request.committedDate")}>
                <span className="block">
                  {r.triagedAt ? (r.committedDueDate ? formatDay(r.committedDueDate, locale, { year: "numeric" }) : t("common.flexible")) : <span className="text-muted">{t("request.notCommitted")}</span>}
                </span>
                {r.canWork && r.triagedAt && !["delivered", "closed", "declined"].includes(r.status) ? (
                  <CommitmentDialog slug={slug} requestId={r.id} current={r.committedDueDate} flexible={r.committedFlexible} />
                ) : null}
              </Meta>
              <Meta label={t("common.project")}>
                {r.canWork ? <ProjectLink slug={slug} requestId={r.id} projects={projectChoices} value={r.projectId} /> : (r.project?.name ?? "—")}
              </Meta>
              <Meta label={t("common.created")}>{formatDateTime(r.submittedAt, locale, actor.tenant.timezone)}</Meta>
            </dl>
            {actor.tenant.features.sla && (slaFirst || slaTriage) ? (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-3">
                {slaFirst ? <SlaPill status={slaFirst.status === "running" && slaFirst.warnedAt ? "at_risk" : slaFirst.status} t={t} label={t("request.sla.firstResponse")} /> : null}
                {slaTriage ? <SlaPill status={slaTriage.status === "running" && slaTriage.warnedAt ? "at_risk" : slaTriage.status} t={t} label={t("request.sla.triage")} /> : null}
              </div>
            ) : null}
            <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
              <Eye className="h-3.5 w-3.5" /> {t(`request.public.${r.publicStatus}`)} — {t("request.publicNote")}
            </p>
          </Panel>
          {ai.enabled && (ai.summarize || ai.next_steps) ? (
            <AiAssist slug={slug} target={{ kind: "request", ref: r.publicRef }} allowNextSteps={ai.next_steps} taskParent={{ requestId: r.id, projectId: r.projectId }} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
