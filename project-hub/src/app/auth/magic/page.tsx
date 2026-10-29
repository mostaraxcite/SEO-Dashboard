import { AuthShell } from "@/components/auth/auth-shell";
import { getI18n } from "@/server/i18n";
import { Button } from "@/components/ui/button";
import { consumeMagicAction } from "@/app/(auth)/actions";
import Link from "next/link";

/** GET only renders a confirm button: link scanners can't consume the token. */
export default async function MagicPage({ searchParams }: { searchParams: Promise<{ token?: string; invalid?: string }> }) {
  const { token, invalid } = await searchParams;
  const { t } = await getI18n();
  return (
    <AuthShell>
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t("auth.magicTitle")}</h1>
        {invalid || !token ? (
          <>
            <p className="mt-2 text-fg-2">{t("auth.magicInvalid")}</p>
            <Link href="/login" className="mt-4 inline-block text-accent hover:underline">
              {t("auth.signIn")}
            </Link>
          </>
        ) : (
          <form action={consumeMagicAction} className="mt-4">
            <p className="mb-4 text-fg-2">{t("auth.magicBody")}</p>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" className="w-full justify-center">
              {t("auth.signIn")}
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
