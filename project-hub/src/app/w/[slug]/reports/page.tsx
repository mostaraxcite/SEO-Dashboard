import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { managerReport } from "@/server/services/reports";
import { isManager } from "@/server/authz";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireStaff(slug);
  if (!isManager(actor)) notFound();
  const { t } = await getI18n();
  const rep = await managerReport(actor);
  const requestsMode = actor.tenant.mode === "requests";
  const stats = [
    requestsMode ? { label: t("reports.onTime"), value: rep.onTime === null ? "—" : `${rep.onTime}%` } : null,
    requestsMode ? { label: t("reports.firstResponse"), value: rep.medianFirstResponseHours === null ? "—" : t("reports.hours", { n: rep.medianFirstResponseHours }) } : null,
    requestsMode ? { label: t("reports.waitingClient"), value: String(rep.waitingOnClient) } : null,
    requestsMode ? { label: t("reports.throughput"), value: String(rep.throughput7d) } : null,
    requestsMode ? { label: t("reports.reopened"), value: rep.reopenedPct === null ? "—" : `${rep.reopenedPct}%` } : null,
    actor.tenant.features.sla ? { label: t("request.sla.breached"), value: String(rep.slaBreached) } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.subtitle")}
        actions={
          requestsMode ? (
            <a href={`/w/${slug}/reports/export`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" /> {t("common.exportCsv")}
            </a>
          ) : null
        }
      />
      {stats.length ? (
        <dl className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="border-line px-4 py-3 [&:not(:first-child)]:border-s max-lg:[&:nth-child(n+3)]:border-t">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="tnum mt-0.5 text-lg font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {requestsMode ? (
          <Panel>
            <PanelHeader title={t("reports.byClient")} />
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{actor.tenant.kind === "internal" ? t("common.department") : t("common.client")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("clients.openRequests")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("reports.lateClient")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rep.byClient.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-2.5">{c.name}</td>
                    <td className="tnum px-3 py-2.5 text-end">{c.open}</td>
                    <td className="tnum px-4 py-2.5 text-end">{c.waiting}</td>
                  </tr>
                ))}
                {rep.byClient.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-muted">{t("reports.noData")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Panel>
        ) : null}
        <Panel>
          <PanelHeader title={t("reports.byOwner")} description={`${t("reports.lateInternal")}: ${rep.lateDependencies.internal} · ${t("reports.lateClient")}: ${rep.lateDependencies.client}`} />
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("common.owner")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("project.openTasks")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("reports.late")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("home.blocked")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rep.byOwner.map((o) => (
                <tr key={o.name}>
                  <td className="px-4 py-2.5">{o.name === "—" ? t("common.unassigned") : o.name}</td>
                  <td className="tnum px-3 py-2.5 text-end">{o.open}</td>
                  <td className="tnum px-3 py-2.5 text-end">{o.late}</td>
                  <td className="tnum px-4 py-2.5 text-end">{o.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
