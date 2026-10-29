import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listCategories } from "@/server/services/workspace";
import { aiEnabledFor } from "@/server/services/settings";
import { systemDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/misc";
import { NewRequestClient } from "./new-request";

export const metadata = { title: "New request" };

export default async function NewRequestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const { category } = await searchParams;
  const actor = await requireClient(slug);
  const { t } = await getI18n();
  const [cats, ai] = await Promise.all([listCategories(actor), aiEnabledFor(actor)]);
  // The SLA target is tenant configuration (not client data); read it server-side to phrase the receipt honestly.
  let policy: string | null = null;
  if (actor.tenant.features.sla) {
    const [p] = await systemDb().select().from(schema.slaPolicies).where(eq(schema.slaPolicies.tenantId, actor.tenant.id));
    if (p) policy = t("reports.hours", { n: Math.round(p.firstResponseMinutes / 60) });
  }
  return (
    <>
      <PageHeader title={t("intake.title")} description={t("portal.needSomethingBody")} />
      <NewRequestClient
        slug={slug}
        categories={cats.map((c) => ({ id: c.id, key: c.key, labelEn: c.labelEn, labelAr: c.labelAr, helpEn: c.helpEn, helpAr: c.helpAr, icon: c.icon, fields: c.fields }))}
        initialCategory={cats.some((c) => c.key === category) ? category! : null}
        aiEnabled={ai.improve_brief}
        responsePolicy={policy}
      />
    </>
  );
}
