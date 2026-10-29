import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listClients } from "@/server/services/workspace";
import { isManager } from "@/server/authz";
import { PageHeader, Panel, EmptyState } from "@/components/ui/misc";
import { NewClientButton } from "@/components/clients/client-forms";

export default async function ClientsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireStaff(slug);
  if (actor.tenant.mode !== "requests" || actor.role === "guest") notFound();
  const { t } = await getI18n();
  const internal = actor.tenant.kind === "internal";
  const rows = await listClients(actor);
  return (
    <>
      <PageHeader
        title={internal ? t("clients.titleDepartments") : t("clients.title")}
        actions={isManager(actor) ? <NewClientButton slug={slug} label={internal ? t("clients.newDepartment") : t("clients.newClient")} /> : null}
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<Users />} title={t("clients.empty")} body={t("clients.emptyBody")} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t("common.name")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("clients.openRequests")}</th>
                <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("clients.activeProjects")}</th>
                <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t("clients.contacts")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="relative hover:bg-hover/60">
                  <td className="px-4 py-3">
                    <Link href={`/w/${slug}/clients/${c.id}`} className="font-medium after:absolute after:inset-0 hover:underline" dir="auto">
                      {c.name}
                    </Link>
                  </td>
                  <td className="tnum px-3 py-3 text-end">{c.openRequests}</td>
                  <td className="tnum hidden px-3 py-3 text-end sm:table-cell">{c.activeProjects}</td>
                  <td className="tnum hidden px-4 py-3 text-end sm:table-cell">{c.contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
