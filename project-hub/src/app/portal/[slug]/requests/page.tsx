import { Inbox } from "lucide-react";
import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listRequests } from "@/server/services/requests";
import { Panel, EmptyState, PageHeader } from "@/components/ui/misc";
import { RequestCard } from "@/components/portal/request-card";
import { Input } from "@/components/ui/form";

export const metadata = { title: "My requests" };

export default async function MyRequests({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const { q } = await searchParams;
  const actor = await requireClient(slug);
  const { t, locale } = await getI18n();
  const rows = await listRequests(actor, { q: q ?? null });
  return (
    <>
      <PageHeader title={t("nav.myRequests")} />
      <form role="search" className="mb-4 max-w-sm">
        <label>
          <span className="sr-only">{t("portal.searchRequests")}</span>
          <Input name="q" type="search" defaultValue={q ?? ""} placeholder={t("portal.searchRequests")} />
        </label>
      </form>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox />} title={q ? t("search.noResults", { q }) : t("portal.noRequests")} body={q ? undefined : t("portal.noRequestsBody")} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <RequestCard key={r.id} r={r} href={`/portal/${slug}/requests/${r.publicRef}`} t={t} locale={locale} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
