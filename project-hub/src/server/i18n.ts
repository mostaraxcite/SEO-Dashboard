import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getSessionUser } from "./auth/session";
import { dirOf, makeT, type Locale } from "@/i18n";

export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getSessionUser();
  if (user) return user.locale;
  const c = (await cookies()).get("ph_locale")?.value;
  if (c === "ar" || c === "en") return c;
  const al = (await headers()).get("accept-language") ?? "";
  return al.toLowerCase().startsWith("ar") ? "ar" : "en";
});

export const getThemePref = cache(async (): Promise<"system" | "light" | "dark"> => {
  const user = await getSessionUser();
  if (user) return user.theme;
  const c = (await cookies()).get("ph_theme")?.value;
  return c === "light" || c === "dark" ? c : "system";
});

export async function getI18n() {
  const locale = await getLocale();
  return { t: makeT(locale), locale, dir: dirOf(locale) as "ltr" | "rtl" };
}
