import { getI18n } from "@/server/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { LocaleSwitch } from "./locale-switch";

/** Quiet, centered layout for sign-in flows. Product identity only — no tenant branding. */
export async function AuthShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const { t, locale } = await getI18n();
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink text-[13px] font-semibold text-[color:var(--canvas)]">
              PH
            </span>
            {t("app.name")}
          </span>
          <LocaleSwitch />
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[6vh]">
          <div className={wide ? "w-full max-w-xl" : "w-full max-w-sm"}>{children}</div>
        </main>
        <footer className="px-5 py-4 text-center text-xs text-muted">{t("app.tagline")}</footer>
      </div>
    </I18nProvider>
  );
}
