import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listProjects } from "@/server/services/projects";
import { clientOptions } from "@/server/services/workspace";
import { formatDay } from "@/i18n";
import { PageHeader, Panel, EmptyState, Avatar, ProgressBar } from "@/components/ui/misc";
import { Pill, projectStatusMeta } from "@/components/ui/status";
import { NewProjectButton } from "@/components/projects/new-project";
import { ClientFilter } from "@/components/requests/client-filter";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ client?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const showClients = actor.tenant.mode === "requests";
  const [projects, clients] = await Promise.all([listProjects(actor, { clientOrgId: sp.client || null }), showClients ? clientOptions(actor) : Promise.resolve([])]);
  const clientLabel = actor.tenant.kind === "internal" ? t("common.department") : t("common.client");
  return (
    <>
      <PageHeader
        title={t("project.projects")}
        actions={
          <>
            {showClients ? <ClientFilter clients={clients} value={sp.client ?? ""} label={clientLabel} /> : null}
            {actor.role !== "guest" ? <NewProjectButton slug={slug} clients={clients} clientLabel={clientLabel} /> : null}
          </>
        }
      />
      <Panel>
        {projects.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title={t("project.empty")} body={t("project.emptyBody")} />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((p) => {
              const meta = projectStatusMeta[p.status];
              const pct = p.total ? (p.done / p.total) * 100 : 0;
              return (
                <li key={p.id} className="relative grid items-center gap-x-6 gap-y-2 px-4 py-3.5 hover:bg-hover/60 sm:grid-cols-[minmax(0,1fr)_120px_160px_110px]">
                  <div className="min-w-0">
                    <Link href={`/w/${slug}/projects/${p.id}`} className="block truncate font-medium text-fg after:absolute after:inset-0 hover:underline" dir="auto">
                      {p.name}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {showClients ? <span className="font-medium text-fg-2">{p.clientName ?? t("project.noClient")}</span> : null}
                      {p.ownerName ? (
                        <span className="inline-flex items-center gap-1">
                          <Avatar name={p.ownerName} size={16} /> {p.ownerName}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Pill tone={meta.tone} icon={meta.icon} className="justify-self-start">
                    {t(`project.status.${p.status}`)}
                  </Pill>
                  <div title={t("project.tasksDone", { done: p.done, total: p.total })}>
                    <ProgressBar value={pct} label={t("project.progress")} />
                  </div>
                  <span className="tnum text-sm text-fg-2 sm:text-end">{p.targetDate ? formatDay(p.targetDate, locale, { year: "numeric" }) : <span className="text-muted">{t("common.noDate")}</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
