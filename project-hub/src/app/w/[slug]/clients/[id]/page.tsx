import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getClient } from "@/server/services/workspace";
import { listRequests } from "@/server/services/requests";
import { listProjects } from "@/server/services/projects";
import { isManager } from "@/server/authz";
import { AppError } from "@/server/errors";
import { PageHeader, Panel, PanelHeader, Avatar, Ref } from "@/components/ui/misc";
import { Pill, requestStatusMeta, projectStatusMeta } from "@/components/ui/status";
import { InviteButton } from "@/components/clients/client-forms";

export default async function ClientPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const actor = await requireStaff(slug);
  const { t } = await getI18n();
  const c = await getClient(actor, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [reqs, projects] = await Promise.all([listRequests(actor, { clientOrgId: id }), listProjects(actor, { clientOrgId: id })]);
  const internal = actor.tenant.kind === "internal";
  return (
    <div className="space-y-5">
      <Link href={`/w/${slug}/clients`} className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {internal ? t("clients.titleDepartments") : t("clients.title")}
      </Link>
      <PageHeader title={c.name} actions={isManager(actor) ? <InviteButton slug={slug} clientOrgId={c.id} roles={["client"]} label={t("clients.inviteContact")} /> : null} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel>
            <PanelHeader title={t("request.requests")} />
            <ul className="divide-y divide-line">
              {reqs.map((r) => (
                <li key={r.id}>
                  <Link href={`/w/${slug}/requests/${r.publicRef}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                    <Ref>{r.publicRef}</Ref>
                    <span className="min-w-0 flex-1 truncate" dir="auto">{r.title}</span>
                    <Pill tone={requestStatusMeta[r.status].tone} icon={requestStatusMeta[r.status].icon}>
                      {t(`request.internal.${r.status}`)}
                    </Pill>
                  </Link>
                </li>
              ))}
              {reqs.length === 0 ? <li className="px-4 py-3 text-sm text-muted">{t("common.none")}</li> : null}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title={t("project.projects")} />
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/w/${slug}/projects/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                    <span className="min-w-0 flex-1 truncate" dir="auto">{p.name}</span>
                    <Pill tone={projectStatusMeta[p.status].tone} icon={projectStatusMeta[p.status].icon}>
                      {t(`project.status.${p.status}`)}
                    </Pill>
                  </Link>
                </li>
              ))}
              {projects.length === 0 ? <li className="px-4 py-3 text-sm text-muted">{t("common.none")}</li> : null}
            </ul>
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel>
            <PanelHeader title={t("clients.contacts")} />
            <ul className="space-y-2.5 p-4">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={p.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted" dir="ltr">{p.email}</span>
                  </span>
                  {p.canApprove ? <span className="text-xs text-muted">{t("clients.canApprove")}</span> : null}
                </li>
              ))}
              {c.contacts.length === 0 ? <li className="text-sm text-muted">{t("common.none")}</li> : null}
            </ul>
            {c.invites.length ? (
              <div className="border-t border-line px-4 py-3">
                <p className="mb-1 text-xs text-muted">{t("settings.pendingInvites")}</p>
                <ul className="space-y-1 text-sm">
                  {c.invites.map((i) => (
                    <li key={i.email} dir="ltr">{i.email}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
