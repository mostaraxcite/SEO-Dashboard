import Link from "next/link";
import { getI18n } from "@/server/i18n";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="tnum text-sm text-muted">404</p>
      <h1 className="mt-1 text-lg font-semibold">{t("common.notFound")}</h1>
      <p className="mt-1 max-w-sm text-fg-2">{t("common.notFoundBody")}</p>
      <Link href="/workspaces" className="mt-4 text-accent hover:underline">
        {t("common.goHome")}
      </Link>
    </main>
  );
}
