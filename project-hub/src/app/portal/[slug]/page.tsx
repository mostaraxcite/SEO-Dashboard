import Link from "next/link";
import { Inbox, Search } from "lucide-react";
import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { portalHome } from "@/server/services/requests";
import { Panel, PanelHeader, EmptyState } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/portal/category-icon";
import { RequestCard } from "@/components/portal/request-card";

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireClient(slug);
  const { t, locale } = await getI18n();
  const home = await portalHome(actor);
  const welcome = (locale === "ar" ? actor.tenant.theme.welcomeAr : actor.tenant.theme.welcomeEn) || t("portal.needSomethingBody");
  return (
    <div className="space-y-8">
      <section aria-labelledby="need-h">
        <h1 id="need-h" className="text-xl font-semibold">
          {t("portal.needSomething")}
        </h1>
        <p className="mt-1 text-fg-2">{welcome}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {home.categories.slice(0, 6).map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/${slug}/new?category=${c.key}`}
                className="group flex h-full items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm transition-colors hover:border-line-strong hover:bg-hover/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-fg">
                  <CategoryIcon name={c.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{locale === "ar" ? c.labelAr : c.labelEn}</span>
                  <span className="mt-0.5 block text-sm text-muted">{locale === "ar" ? c.helpAr : c.helpEn}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Panel>
        <PanelHeader
          title={t("portal.recent")}
          actions={
            <form action={`/portal/${slug}/requests`} role="search" className="hidden sm:block">
              <label className="relative block">
                <span className="sr-only">{t("portal.searchRequests")}</span>
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input name="q" type="search" placeholder={t("portal.searchRequests")} className="h-8 w-56 rounded-md border border-line bg-surface ps-8 pe-2 text-sm placeholder:text-muted focus-visible:border-focus focus-visible:outline-none" />
              </label>
            </form>
          }
        />
        {home.recent.length === 0 ? (
          <EmptyState icon={<Inbox />} title={t("portal.noRequests")} body={t("portal.noRequestsBody")} />
        ) : (
          <div className="divide-y divide-line">
            {home.recent.map((r) => (
              <RequestCard key={r.id} r={r} href={`/portal/${slug}/requests/${r.publicRef}`} t={t} locale={locale} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
