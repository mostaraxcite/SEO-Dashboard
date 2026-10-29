import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { withScope, systemDb, schema } from "../db";
import type { Actor } from "../context";
import { assertAdmin, assertManager, assertStaff, isAdmin } from "../authz";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { recordEvent } from "../events";
import { randomToken, sha256 } from "../auth/crypto";
import { env } from "../env";
import { emailProvider } from "../notify/providers";
import { brandPalette } from "@/lib/color";
import { makeT } from "@/i18n";
import * as v from "../validation";

const { clientOrganizations, clientContacts, memberships, users, requests, projects } = schema;

// ─── Clients / departments ──────────────────────────────────────────────

export async function listClients(actor: Actor) {
  assertStaff(actor);
  return withScope(actor.scope, (tx) =>
    tx
      .select({
        id: clientOrganizations.id,
        name: clientOrganizations.name,
        type: clientOrganizations.type,
        archivedAt: clientOrganizations.archivedAt,
        openRequests: sql<number>`(select count(*)::int from requests r where r.client_org_id = ${clientOrganizations.id} and r.status not in ('delivered','closed','declined'))`,
        activeProjects: sql<number>`(select count(*)::int from projects p where p.client_org_id = ${clientOrganizations.id} and p.status in ('active','planned'))`,
        contacts: sql<number>`(select count(*)::int from client_contacts c where c.client_org_id = ${clientOrganizations.id})`,
      })
      .from(clientOrganizations)
      .where(isNull(clientOrganizations.archivedAt))
      .orderBy(asc(clientOrganizations.name)),
  );
}

export async function clientOptions(actor: Actor) {
  if (!actor.isStaff) return [];
  return withScope(actor.scope, (tx) =>
    tx.select({ id: clientOrganizations.id, name: clientOrganizations.name }).from(clientOrganizations).where(isNull(clientOrganizations.archivedAt)).orderBy(asc(clientOrganizations.name)),
  );
}

export async function getClient(actor: Actor, id: string) {
  assertStaff(actor);
  if (!z.uuid().safeParse(id).success) throw notFound();
  return withScope(actor.scope, async (tx) => {
    const [c] = await tx.select().from(clientOrganizations).where(eq(clientOrganizations.id, id)).limit(1);
    if (!c) throw notFound();
    const contacts = await tx
      .select({ id: users.id, name: users.name, email: users.email, canApprove: clientContacts.canApprove })
      .from(clientContacts)
      .innerJoin(users, eq(users.id, clientContacts.userId))
      .where(eq(clientContacts.clientOrgId, id))
      .orderBy(asc(users.name));
    const invites = isAdmin(actor) || actor.role === "manager" ? await pendingInvites(actor, id) : [];
    return { ...c, contacts, invites };
  });
}

export async function createClient(actor: Actor, raw: unknown) {
  assertManager(actor);
  const input = z.object({ name: v.text(120) }).parse(raw);
  return withScope(actor.scope, async (tx) => {
    const exists = await tx.select({ id: clientOrganizations.id }).from(clientOrganizations).where(sql`lower(${clientOrganizations.name}) = ${input.name.toLowerCase()}`);
    if (exists.length) throw new AppError("conflict", "conflict");
    const [c] = await tx
      .insert(clientOrganizations)
      .values({ tenantId: actor.tenant.id, name: input.name, type: actor.tenant.kind === "internal" ? "department" : "external" })
      .returning();
    await recordEvent(tx, actor, { type: "client.created", entityType: "client_org", entityId: c.id, data: { name: c.name } });
    return c;
  });
}

// ─── Members & invitations ──────────────────────────────────────────────

export async function listMembers(actor: Actor) {
  assertStaff(actor);
  return withScope(actor.scope, (tx) =>
    tx
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, title: memberships.title, disabledAt: memberships.disabledAt, clientName: clientOrganizations.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(clientContacts, and(eq(clientContacts.userId, memberships.userId), eq(clientContacts.tenantId, memberships.tenantId)))
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, clientContacts.clientOrgId))
      .orderBy(asc(sql`case ${memberships.role} when 'client' then 1 else 0 end`), asc(users.name)),
  );
}

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(["admin", "manager", "member", "guest", "client"]),
  clientOrgId: v.nullableId,
});

/**
 * Creates a single-use, 7-day invitation. Role and client org are stored server-side.
 * Admins invite staff; managers may invite client contacts.
 */
export async function createInvite(actor: Actor, raw: unknown) {
  const input = inviteInput.parse(raw);
  if (input.role === "client") {
    assertManager(actor);
    if (!input.clientOrgId) throw invalid("invalid", { field: "clientOrgId" });
  } else {
    assertAdmin(actor);
    input.clientOrgId = null;
  }
  // Validate the client org belongs to this tenant under RLS.
  if (input.clientOrgId) {
    const ok = await withScope(actor.scope, (tx) => tx.select({ id: clientOrganizations.id }).from(clientOrganizations).where(eq(clientOrganizations.id, input.clientOrgId!)));
    if (!ok.length) throw notFound();
  }
  // An existing staff member cannot be downgraded into a client by invitation (and vice versa).
  const existing = await systemDb()
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, actor.tenant.id), sql`lower(${users.email}) = ${input.email}`))
    .limit(1);
  if (existing[0] && (existing[0].role === "client") !== (input.role === "client")) throw new AppError("conflict", "conflict");
  const token = randomToken();
  await systemDb().insert(schema.authTokens).values({
    tokenHash: sha256(token),
    purpose: "invite",
    email: input.email,
    tenantId: actor.tenant.id,
    role: input.role,
    clientOrgId: input.clientOrgId,
    invitedBy: actor.user.id,
    expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  await withScope(actor.scope, (tx) =>
    recordEvent(tx, actor, { type: "invite.created", entityType: "invite", entityId: input.email, data: { role: input.role, clientOrgId: input.clientOrgId } }),
  );
  const link = `${env.appUrl}/invite/${encodeURIComponent(token)}`;
  const t = makeT(actor.user.locale);
  await emailProvider()
    .send({
      to: input.email,
      tenantId: actor.tenant.id,
      subject: `${t("auth.inviteTitle")} — ${actor.tenant.theme.displayName ?? actor.tenant.name}`,
      text: `${t("auth.inviteBody", { inviter: actor.user.name, workspace: actor.tenant.theme.displayName ?? actor.tenant.name })}\n\n${link}`,
    })
    .catch((e) => console.error("[invite] email failed; link still shown to inviter", (e as Error).message));
  return { link };
}

export async function pendingInvites(actor: Actor, clientOrgId?: string) {
  assertManager(actor);
  return systemDb()
    .select({ email: schema.authTokens.email, role: schema.authTokens.role, expiresAt: schema.authTokens.expiresAt, clientOrgId: schema.authTokens.clientOrgId })
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.tenantId, actor.tenant.id),
        eq(schema.authTokens.purpose, "invite"),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
        clientOrgId ? eq(schema.authTokens.clientOrgId, clientOrgId) : undefined,
      ),
    )
    .orderBy(desc(schema.authTokens.createdAt));
}

export async function setMemberRole(actor: Actor, userId: string, role: string) {
  assertAdmin(actor);
  const r = z.enum(["admin", "manager", "member", "guest"]).parse(role);
  if (userId === actor.user.id) throw forbidden();
  return withScope(actor.scope, async (tx) => {
    const [m] = await tx.select().from(memberships).where(eq(memberships.userId, userId)).limit(1);
    if (!m || m.role === "client" || m.role === "owner") throw forbidden();
    await tx.update(memberships).set({ role: r }).where(eq(memberships.id, m.id));
    await recordEvent(tx, actor, { type: "member.role_changed", entityType: "membership", entityId: m.id, data: { from: m.role, to: r } });
  });
}

// ─── Workspace settings ─────────────────────────────────────────────────

const generalInput = z.object({
  name: v.text(80),
  mode: z.enum(["simple", "requests"]),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
  defaultLocale: z.enum(["en", "ar"]),
  sla: v.checkbox,
  requireApprovalToDeliver: v.checkbox,
});

export async function updateGeneral(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = generalInput.parse(raw);
  return withScope(actor.scope, async (tx) => {
    const [t] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, actor.tenant.id));
    await tx
      .update(schema.tenants)
      .set({
        name: input.name,
        mode: input.mode,
        timezone: input.timezone,
        defaultLocale: input.defaultLocale,
        features: { ...t.features, sla: input.sla, requireApprovalToDeliver: input.requireApprovalToDeliver },
      })
      .where(eq(schema.tenants.id, actor.tenant.id));
    await tx.update(schema.businessCalendars).set({ timezone: input.timezone, updatedAt: new Date() }).where(eq(schema.businessCalendars.tenantId, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.general", entityType: "tenant", entityId: actor.tenant.id, data: { mode: input.mode, sla: input.sla } });
  });
}

const brandingInput = z.object({
  brandColor: z.preprocess((x) => (x === "" ? null : x), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()),
  displayName: z.preprocess((x) => (x === "" ? null : x), z.string().trim().max(80).nullable()),
  welcomeEn: z.preprocess((x) => (x === "" ? null : x), z.string().trim().max(280).nullable()),
  welcomeAr: z.preprocess((x) => (x === "" ? null : x), z.string().trim().max(280).nullable()),
});

/** Stores the requested brand color plus the contrast-adjusted value actually used. */
export async function updateBranding(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = brandingInput.parse(raw);
  const palette = input.brandColor ? brandPalette(input.brandColor) : null;
  return withScope(actor.scope, async (tx) => {
    const [t] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, actor.tenant.id));
    await tx
      .update(schema.tenants)
      .set({ theme: { ...t.theme, brandColor: palette?.input ?? null, displayName: input.displayName, welcomeEn: input.welcomeEn, welcomeAr: input.welcomeAr } })
      .where(eq(schema.tenants.id, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.branding", entityType: "tenant", entityId: actor.tenant.id, data: { brandColor: palette?.input ?? null } });
    return { adjusted: palette?.adjusted ? palette.light.brand : null };
  });
}

export async function setLogo(actor: Actor, fileId: string | null) {
  assertAdmin(actor);
  return withScope(actor.scope, async (tx) => {
    const [t] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, actor.tenant.id));
    await tx.update(schema.tenants).set({ theme: { ...t.theme, logoFileId: fileId } }).where(eq(schema.tenants.id, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.logo", entityType: "tenant", entityId: actor.tenant.id, data: { fileId } });
  });
}

export async function listCategories(actor: Actor, opts: { includeDisabled?: boolean } = {}) {
  return withScope(actor.scope, (tx) =>
    tx
      .select()
      .from(schema.serviceCategories)
      .where(opts.includeDisabled ? undefined : eq(schema.serviceCategories.enabled, true))
      .orderBy(asc(schema.serviceCategories.position)),
  );
}

const categoryInput = z.object({
  labelEn: v.text(60),
  labelAr: v.text(60),
  helpEn: v.optionalText(200),
  helpAr: v.optionalText(200),
  enabled: v.checkbox,
  position: z.coerce.number().int().min(0).max(100),
  defaultOwnerId: v.nullableId,
});

export async function updateCategory(actor: Actor, id: string, raw: unknown) {
  assertAdmin(actor);
  const input = categoryInput.parse(raw);
  return withScope(actor.scope, async (tx) => {
    const [c] = await tx.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.id, id));
    if (!c) throw notFound();
    if (input.defaultOwnerId) {
      const ok = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, input.defaultOwnerId), ne(memberships.role, "client")));
      if (!ok.length) throw invalid();
    }
    await tx
      .update(schema.serviceCategories)
      .set({ ...input, version: c.version + 1 })
      .where(eq(schema.serviceCategories.id, id));
    await recordEvent(tx, actor, { type: "settings.category", entityType: "service_category", entityId: id, data: { enabled: input.enabled } });
  });
}

export async function workspaceCounts(actor: Actor) {
  return withScope(actor.scope, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(requests);
    const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(projects);
    return { requests: Number(r.n), projects: Number(p.n) };
  });
}
