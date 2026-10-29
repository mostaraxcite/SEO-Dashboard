import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listPendingApprovals } from "@/server/services/delivery";
import { formatRelative } from "@/i18n";
import { PageHeader, Panel, EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Approvals" };

export default async function Approvals({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireClient(slug);
  const { t, locale } = await getI18n();
  const rows = actor.canApprove ? await listPendingApprovals(actor) : [];
  return (
    <>
      <PageHeader title={t("portal.approvalsTitle")} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<CircleCheckBig />} title={t("portal.noApprovals")} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id}>
                <Link href={`/portal/${slug}/requests/${a.ref}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover/60">
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-xs text-muted">
                      {a.ref} · {t("portal.version", { n: a.version })}
                    </p>
                    <p className="truncate font-medium" dir="auto">{a.title}</p>
                    <p className="truncate text-sm text-fg-2" dir="auto">{a.deliverableTitle}</p>
                  </div>
                  <span className="text-xs text-muted">{formatRelative(a.createdAt, locale)}</span>
                  <span className="text-sm font-medium text-accent">{t("portal.review")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
