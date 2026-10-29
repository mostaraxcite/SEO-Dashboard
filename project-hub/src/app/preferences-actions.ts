"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { systemDb, schema } from "@/server/db";
import { getSessionUser } from "@/server/auth/session";

const YEAR = 365 * 86400;

/** Locale/theme are personal preferences; stored on the user (and a cookie for signed-out pages). */
export async function setLocale(locale: string) {
  const l = locale === "ar" ? "ar" : "en";
  const jar = await cookies();
  jar.set("ph_locale", l, { path: "/", maxAge: YEAR, sameSite: "lax" });
  const user = await getSessionUser();
  if (user) await systemDb().update(schema.users).set({ locale: l }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
}

export async function setTheme(theme: string) {
  const v = theme === "light" || theme === "dark" ? theme : "system";
  const jar = await cookies();
  jar.set("ph_theme", v, { path: "/", maxAge: YEAR, sameSite: "lax" });
  const user = await getSessionUser();
  if (user) await systemDb().update(schema.users).set({ theme: v }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
}
