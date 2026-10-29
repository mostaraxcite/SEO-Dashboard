import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listRequests } from "@/server/services/requests";
import { clientOptions } from "@/server/services/workspace";
import { assertRequestsMode } from "@/server/authz";
import { formatDay, formatRelative } from "@/i18n";
import { PageHeader, Panel, EmptyState, Avatar } from "@/components/ui/misc";
import { Pill, requestStatusMeta } from "@/components/ui/status";
import { TabLink } from "@/components/shell/nav-link";
import { SlaPill } from "@/components/requests/sla";
import { buttonClass } from "@/components/ui/button";
import { ClientFilter } from "@/components/requests/client-filter";
import { notFound } from "next/navigation";

export const metadata = { title: "Inbox" };
const TABS = ["triage", "waiting", "active", "done", "all"] as const;

export default async function InboxPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; client?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const actor = await requireStaff(slug);
  try {
    assertRequestsMode(actor);
  } catch {
    notFound();
  }
  const { t, locale } = await getI18n();
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "triage";
  const [rows, clients] = await Promise.all([listRequests(actor, { tab, clientOrgId: sp.client || null }), clientOptions(actor)]);
  const internal = actor.tenant.kind === "internal";
  const q = (tb: string) => `/w/${slug}/inbox?tab=${tb}${sp.client ? `&client=${sp.client}` : ""}`;
  const tabLabels: Record<string, string> = { triage: t("inbox.tabTriage"), waiting: t("inbox.tabWaiting"), active: t("inbox.tabActive"), done: t("request.public.delivered"), all: t("inbox.tabAll") };
  return (
    <>
      <PageHeader
        title={t("inbox.title")}
        description={t("inbox.subtitle")}
        actions={
          <Link href={`/w/${slug}/requests/new`} className={buttonClass("secondary", "md")}>
            <Plus className="h-4 w-4" /> {t("nav.newRequest")}
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label={t("inbox.title")}>
          {TABS.map((tb) => (
            <TabLink key={tb} href={q(tb)} label={tabLabels[tb]} isDefault={tb === "triage"} />
          ))}
        </nav>
        <div className="pb-2">
          <ClientFilter clients={clients} value={sp.client ?? ""} label={internal ? t("common.department") : t("common.client")} />
        </div>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox />} title={t("inbox.empty")} body={t("inbox.emptyBody")} />
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden border-b border-line text-xs text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("request.request")}</th>
                <th className="px-3 py-2 text-start font-medium">{internal ? t("common.department") : t("common.client")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("request.requestedDate")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("common.owner")}</th>
                {actor.tenant.features.sla ? <th className="px-3 py-2 text-start font-medium">{t("inbox.sla")}</th> : null}
                <th className="px-4 py-2 text-end font-medium">{t("request.lastChange")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const meta = requestStatusMeta[r.status];
                return (
                  <tr key={r.id} className="relative block hover:bg-hover/60 md:table-row">
                    <td className="block px-4 pt-3 md:table-cell md:py-3">
                      <div className="flex items-center gap-2">
                        <span className="tnum text-xs text-muted">{r.publicRef}</span>
                        <Pill tone={meta.tone} icon={meta.icon}>
                          {t(`request.internal.${r.status}`)}
                        </Pill>
                        {r.priority === "high" ? <Pill tone="danger">{t("request.priorityHigh")}</Pill> : null}
                      </div>
                      <Link href={`/w/${slug}/requests/${r.publicRef}`} className="mt-1 block font-medium text-fg after:absolute after:inset-0 hover:underline" dir="auto">
                        {r.title}
                      </Link>
                    </td>
                    <td className="inline-block px-4 pb-3 text-fg-2 md:table-cell md:px-3 md:py-3">{r.clientName ?? "—"}</td>
                    <td className="tnum inline-block px-2 pb-3 text-fg-2 md:table-cell md:px-3 md:py-3">
                      {r.requestedDueDate ? formatDay(r.requestedDueDate, locale) : <span className="text-muted">{t("common.flexible")}</span>}
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      {r.ownerName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={r.ownerName} size={20} /> <span className="truncate">{r.ownerName}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{t("common.unassigned")}</span>
                      )}
                    </td>
                    {actor.tenant.features.sla ? (
                      <td className="inline-block px-2 pb-3 md:table-cell md:px-3 md:py-3">
                        <SlaPill status={r.slaStatus} t={t} />
                      </td>
                    ) : null}
                    <td className="hidden px-4 py-3 text-end text-xs text-muted md:table-cell">{formatRelative(r.updatedAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
