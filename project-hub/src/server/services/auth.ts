import "server-only";
import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { systemDb, schema } from "../db";
import { hashPassword, verifyPassword } from "../auth/password";
import { randomToken, sha256 } from "../auth/crypto";
import { createSession } from "../auth/session";
import { rateLimit } from "../auth/rate-limit";
import { AppError, invalid } from "../errors";
import { env } from "../env";
import { emailProvider } from "../notify/providers";
import { bootstrapTenant, slugify } from "./bootstrap";
import type { Role } from "../db/schema";
import { makeT, type Locale } from "@/i18n";

const email = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));
const password = z.string().min(10, "errors.password_short").max(200);

/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next.slice(0, 500);
}

async function userByEmail(addr: string) {
  const [u] = await systemDb()
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${addr.toLowerCase()}`)
    .limit(1);
  return u ?? null;
}

export async function loginWithPassword(raw: { email: unknown; password: unknown }, ip: string) {
  const addr = email.safeParse(raw.email);
  const pw = typeof raw.password === "string" ? raw.password : "";
  await rateLimit(`login:ip:${ip}`, 30, 900);
  if (!addr.success) throw new AppError("invalid", "invalid");
  await rateLimit(`login:email:${addr.data}`, 10, 900);
  const user = await userByEmail(addr.data);
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = await verifyPassword(pw, user?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  if (!user || !ok || user.disabledAt) throw new AppError("invalid", "invalid_credentials");
  await createSession(user.id);
  await systemDb().insert(schema.auditLogs).values({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, data: { method: "password" } });
  return user;
}

export async function requestMagicLink(rawEmail: unknown, next: string | null, ip: string, locale: Locale) {
  await rateLimit(`magic:ip:${ip}`, 20, 900);
  const addr = email.safeParse(rawEmail);
  if (!addr.success) throw invalid();
  await rateLimit(`magic:email:${addr.data}`, 5, 900);
  const user = await userByEmail(addr.data);
  // Same response whether or not the account exists (no account enumeration).
  if (!user || user.disabledAt) return;
  const token = randomToken();
  await systemDb().insert(schema.authTokens).values({
    tokenHash: sha256(token),
    purpose: "magic_link",
    email: user.email,
    userId: user.id,
    redirectTo: safeNext(next),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  const t = makeT(user.locale === "ar" ? "ar" : locale);
  const link = `${env.appUrl}/auth/magic?token=${encodeURIComponent(token)}`;
  await emailProvider().send({
    to: user.email,
    subject: t("auth.magicTitle"),
    text: `${t("auth.magicBody")}\n\n${link}\n\n(15 min)`,
  });
}

/** Consumes a magic-link token (POST only). Returns the redirect target. */
export async function consumeMagicLink(token: string) {
  const db = systemDb();
  const [row] = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authTokens.tokenHash, sha256(token)),
        eq(schema.authTokens.purpose, "magic_link"),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row?.userId) throw new AppError("invalid", "invalid");
  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(and(eq(schema.users.id, row.userId), isNull(schema.users.emailVerifiedAt)));
  await createSession(row.userId);
  await db.insert(schema.auditLogs).values({ actorId: row.userId, action: "auth.login", entityType: "user", entityId: row.userId, data: { method: "magic_link" } });
  return row.redirectTo ?? "/workspaces";
}

export const signupInput = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password,
  workspaceName: z.string().trim().min(2).max(80),
  type: z.enum(["team", "agency", "internal"]),
  locale: z.enum(["en", "ar"]).default("en"),
});

export async function signup(raw: unknown, ip: string) {
  await rateLimit(`signup:ip:${ip}`, 10, 3600);
  const input = signupInput.parse(raw);
  if (await userByEmail(input.email)) throw new AppError("conflict", "email_taken");
  const passwordHash = await hashPassword(input.password);
  const db = systemDb();
  const tenant = await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ email: input.email, name: input.name, passwordHash, locale: input.locale }).returning();
    let slug = slugify(input.workspaceName);
    for (let i = 0; i < 20; i++) {
      const candidate = i === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const [taken] = await tx.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, candidate)).limit(1);
      if (!taken) {
        slug = candidate;
        break;
      }
    }
    const tenant = await bootstrapTenant(tx, {
      name: input.workspaceName,
      slug,
      kind: input.type,
      mode: input.type === "team" ? "simple" : "requests",
      timezone: input.locale === "ar" ? "Asia/Riyadh" : "UTC",
      defaultLocale: input.locale,
      features: { sla: input.type === "internal" },
    });
    await tx.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });
    await tx.insert(schema.auditLogs).values({ tenantId: tenant.id, actorId: user.id, action: "tenant.created", entityType: "tenant", entityId: tenant.id, data: { kind: input.type } });
    return { tenant, user };
  });
  await createSession(tenant.user.id);
  return tenant.tenant;
}

/** Looks up a pending invitation without consuming it. */
export async function getInvite(token: string) {
  const db = systemDb();
  const [row] = await db
    .select({ inv: schema.authTokens, tenantName: schema.tenants.name, tenantSlug: schema.tenants.slug, inviterName: schema.users.name })
    .from(schema.authTokens)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.authTokens.tenantId))
    .leftJoin(schema.users, eq(schema.users.id, schema.authTokens.invitedBy))
    .where(and(eq(schema.authTokens.tokenHash, sha256(token)), eq(schema.authTokens.purpose, "invite"), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/**
 * Accepts an invitation. The role, tenant and client organization come from the
 * stored invitation — never from the submitted form — so editing hidden fields
 * cannot grant another client's access.
 */
export async function acceptInvite(token: string, sessionUser: { id: string; email: string } | null, form: { name?: unknown; password?: unknown }) {
  const db = systemDb();
  const invite = await getInvite(token);
  if (!invite) throw new AppError("invalid", "invalid");
  const inv = invite.inv;
  if (sessionUser && sessionUser.email.toLowerCase() !== inv.email.toLowerCase()) throw new AppError("forbidden", "invite_mismatch");
  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.authTokens.id, inv.id), isNull(schema.authTokens.usedAt)))
      .returning();
    if (!claimed) throw new AppError("conflict", "invalid");
    let userId = sessionUser?.id ?? null;
    if (!userId) {
      const existing = await tx.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${inv.email.toLowerCase()}`).limit(1);
      if (existing[0]) throw new AppError("unauthenticated", "email_taken");
      const name = z.string().trim().min(1).max(120).parse(form.name);
      const pw = typeof form.password === "string" && form.password.length > 0 ? password.parse(form.password) : null;
      const [u] = await tx
        .insert(schema.users)
        .values({ email: inv.email, name, passwordHash: pw ? await hashPassword(pw) : null, emailVerifiedAt: new Date(), locale: "en" })
        .returning();
      userId = u.id;
    }
    const role = inv.role as Role;
    await tx
      .insert(schema.memberships)
      .values({ tenantId: inv.tenantId!, userId, role })
      .onConflictDoUpdate({ target: [schema.memberships.tenantId, schema.memberships.userId], set: { role, disabledAt: null } });
    if (role === "client") {
      if (!inv.clientOrgId) throw new AppError("invalid");
      await tx
        .insert(schema.clientContacts)
        .values({ tenantId: inv.tenantId!, clientOrgId: inv.clientOrgId, userId, canApprove: true })
        .onConflictDoUpdate({ target: [schema.clientContacts.tenantId, schema.clientContacts.userId], set: { clientOrgId: inv.clientOrgId } });
    }
    await tx.insert(schema.auditLogs).values({ tenantId: inv.tenantId, actorId: userId, action: "invite.accepted", entityType: "membership", entityId: userId, data: { role } });
    return { userId, slug: invite.tenantSlug, role };
  });
  if (!sessionUser) await createSession(result.userId);
  return result;
}
