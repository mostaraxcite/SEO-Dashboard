"use client";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { setLocale } from "@/app/preferences-actions";

export function LocaleSwitch() {
  const { locale } = useI18n();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setLocale(next))}
      lang={next}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-2 hover:bg-hover"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {next === "ar" ? "العربية" : "English"}
    </button>
  );
}
