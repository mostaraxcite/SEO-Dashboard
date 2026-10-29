import { notFound } from "next/navigation";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listCategories, clientOptions } from "@/server/services/workspace";
import { aiEnabledFor } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/misc";
import { StaffNewRequest } from "./form";

export default async function StaffNewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireStaff(slug);
  if (actor.tenant.mode !== "requests" || actor.role === "guest") notFound();
  const { t } = await getI18n();
  const [cats, clients, ai] = await Promise.all([listCategories(actor), clientOptions(actor), aiEnabledFor(actor)]);
  return (
    <>
      <PageHeader title={t("intake.title")} />
      <StaffNewRequest
        slug={slug}
        categories={cats.map((c) => ({ id: c.id, key: c.key, labelEn: c.labelEn, labelAr: c.labelAr, helpEn: c.helpEn, helpAr: c.helpAr, icon: c.icon, fields: c.fields }))}
        clients={clients}
        aiEnabled={ai.improve_brief}
      />
    </>
  );
}
