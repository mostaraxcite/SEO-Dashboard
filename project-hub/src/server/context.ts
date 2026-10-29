import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { systemDb, schema, type DbScope } from "./db";
import { getSessionUser, type SessionUser } from "./auth/session";
import type { Role, TenantFeatures, TenantKind, TenantMode, TenantTheme } from "./db/schema";
import { AppError } from "./errors";

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  mode: TenantMode;
  kind: TenantKind;
  timezone: string;
  theme: TenantTheme;
  features: TenantFeatures;
  isDemo: boolean;
};

export type Actor = {
  user: SessionUser;
  tenant: TenantInfo;
  role: Role;
  clientOrgId: string | null;
  clientOrgName: string | null;
  canApprove: boolean;
  isStaff: boolean;
  scope: DbScope;
};

/**
 * Resolves the active workspace for the signed-in user from the URL slug.
 * Membership is verified server-side; nothing here is taken from form input.
 */
export const resolveActor = cache(async (slug: string): Promise<Actor | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return loadActor(user, slug);
});

/** Builds the actor for a known user + workspace slug (used by sessions, seeds, tests and the worker). */
export async function loadActor(user: SessionUser, slug: string): Promise<Actor | null> {
  const db = systemDb();
  const rows = await db
    .select({ t: schema.tenants, m: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(and(eq(schema.tenants.slug, slug), eq(schema.memberships.userId, user.id), isNull(schema.memberships.disabledAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  let clientOrgId: string | null = null;
  let clientOrgName: string | null = null;
  let canApprove = row.m.role !== "client";
  if (row.m.role === "client") {
    const cc = await db
      .select({ c: schema.clientContacts, o: schema.clientOrganizations })
      .from(schema.clientContacts)
      .innerJoin(schema.clientOrganizations, eq(schema.clientOrganizations.id, schema.clientContacts.clientOrgId))
      .where(and(eq(schema.clientContacts.tenantId, row.t.id), eq(schema.clientContacts.userId, user.id)))
      .limit(1);
    // A client membership without a client organization grants nothing.
    if (!cc[0] || cc[0].o.archivedAt) return null;
    clientOrgId = cc[0].c.clientOrgId;
    clientOrgName = cc[0].o.name;
    canApprove = cc[0].c.canApprove;
  }
  const tenant: TenantInfo = {
    id: row.t.id,
    slug: row.t.slug,
    name: row.t.name,
    mode: row.t.mode,
    kind: row.t.kind,
    timezone: row.t.timezone,
    theme: row.t.theme ?? {},
    features: row.t.features,
    isDemo: row.t.isDemo,
  };
  return {
    user,
    tenant,
    role: row.m.role,
    clientOrgId,
    clientOrgName,
    canApprove,
    isStaff: row.m.role !== "client",
    scope: { tenantId: tenant.id, userId: user.id, clientOrgId },
  };
}

/** For staff pages: redirects to login / portal / workspace picker as appropriate. */
export async function requireStaff(slug: string): Promise<Actor> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/w/${encodeURIComponent(slug)}`);
  const actor = await resolveActor(slug);
  if (!actor) redirect("/workspaces?denied=1");
  if (!actor.isStaff) redirect(`/portal/${slug}`);
  return actor;
}

export async function requireClient(slug: string): Promise<Actor> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/portal/${encodeURIComponent(slug)}`);
  const actor = await resolveActor(slug);
  if (!actor) redirect("/workspaces?denied=1");
  if (actor.isStaff) redirect(`/w/${slug}`);
  return actor;
}

/** For server actions: throws instead of redirecting. */
export async function actorFor(slug: string): Promise<Actor> {
  const actor = await resolveActor(slug);
  if (!actor) throw new AppError("unauthenticated");
  return actor;
}

export async function listWorkspacesFor(userId: string) {
  return systemDb()
    .select({ slug: schema.tenants.slug, name: schema.tenants.name, role: schema.memberships.role, theme: schema.tenants.theme })
    .from(schema.memberships)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(and(eq(schema.memberships.userId, userId), isNull(schema.memberships.disabledAt)))
    .orderBy(schema.tenants.name);
}
