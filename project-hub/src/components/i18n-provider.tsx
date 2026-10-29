"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type Locale, type T } from "@/i18n";

const Ctx = createContext<{ locale: Locale; t: T; timeZone: string } | null>(null);

export function I18nProvider({ locale, timeZone = "UTC", children }: { locale: Locale; timeZone?: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale), timeZone }), [locale, timeZone]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
