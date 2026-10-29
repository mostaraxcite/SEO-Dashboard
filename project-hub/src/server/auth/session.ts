import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { and, eq, gt, isNull } from "drizzle-orm";
import { systemDb, schema } from "../db";
import { randomToken, sha256 } from "./crypto";
import { env } from "../env";

export const SESSION_COOKIE = "ph_session";
const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 15;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  locale: "en" | "ar";
  theme: "system" | "light" | "dark";
  phoneE164: string | null;
};

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await systemDb().insert(schema.sessions).values({ id: sha256(token), userId, expiresAt, userAgent: ua });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await systemDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Resolves the signed-in user from the session cookie. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = systemDb();
  const rows = await db
    .select({ s: schema.sessions, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date()), isNull(schema.users.disabledAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.s.expiresAt.getTime() - Date.now() < RENEW_WITHIN_DAYS * 86400_000) {
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) })
      .where(eq(schema.sessions.id, row.s.id));
  }
  return {
    id: row.u.id,
    email: row.u.email,
    name: row.u.name,
    locale: row.u.locale === "ar" ? "ar" : "en",
    theme: (["light", "dark"].includes(row.u.theme) ? row.u.theme : "system") as SessionUser["theme"],
    phoneE164: row.u.phoneE164,
  };
});
