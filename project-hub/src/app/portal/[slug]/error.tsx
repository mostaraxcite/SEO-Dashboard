"use client";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

/** Friendly, non-leaky error state. Details stay in server logs (digest shown for support). */
export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">{t("common.somethingWrong")}</h1>
      {error.digest ? <p className="tnum mt-1 text-xs text-muted">ref {error.digest}</p> : null}
      <Button className="mt-4" onClick={reset}>
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}
