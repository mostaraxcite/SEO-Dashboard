import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { assertNotGuest, isManager, projectVisible } from "../authz";
import { forbidden, notFound } from "../errors";
import { recordEvent } from "../events";
import { assertStaffUsers } from "./people";
import * as v from "../validation";

const { projects, clientOrganizations, users, projectMembers } = schema;

export const projectInput = z.object({
  name: v.text(160),
  description: v.optionalText(5000),
  clientOrgId: v.nullableId,
  targetDate: v.day,
  access: z.enum(["workspace", "members"]).default("workspace"),
  status: z.enum(["planned", "active", "on_hold", "completed", "archived"]).default("active"),
  ownerId: v.nullableId.optional(),
});

export async function listProjects(actor: Actor, filter: { clientOrgId?: string | null; status?: string | null } = {}) {
  if (!actor.isStaff) return [];
  return withScope(actor.scope, async (tx) => {
    const rows = await tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        targetDate: projects.targetDate,
        clientOrgId: projects.clientOrgId,
        clientName: clientOrganizations.name,
        ownerName: users.name,
        updatedAt: projects.updatedAt,
        total: sql<number>`(select count(*)::int from tasks t where t.project_id = ${projects.id} and t.parent_task_id is null)`,
        done: sql<number>`(select count(*)::int from tasks t where t.project_id = ${projects.id} and t.parent_task_id is null and t.status = 'done')`,
      })
      .from(projects)
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, projects.clientOrgId))
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(
        and(
          projectVisible(actor),
          filter.clientOrgId ? eq(projects.clientOrgId, filter.clientOrgId) : undefined,
          filter.status ? eq(projects.status, filter.status as never) : sql`${projects.status} <> 'archived'`,
        ),
      )
      .orderBy(asc(sql`case ${projects.status} when 'active' then 0 when 'planned' then 1 when 'on_hold' then 2 else 3 end`), desc(projects.updatedAt));
    return rows;
  });
}

export async function getProject(actor: Actor, id: string) {
  if (!actor.isStaff || !z.uuid().safeParse(id).success) throw notFound();
  return withScope(actor.scope, async (tx) => {
    const [p] = await tx
      .select({ p: projects, clientName: clientOrganizations.name, ownerName: users.name })
      .from(projects)
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, projects.clientOrgId))
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(and(eq(projects.id, id), projectVisible(actor)))
      .limit(1);
    if (!p) throw notFound();
    const members = await tx
      .select({ id: users.id, name: users.name, expiresAt: projectMembers.expiresAt })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, id));
    return { ...p.p, clientName: p.clientName, ownerName: p.ownerName, members };
  });
}

function canManageProject(actor: Actor, p: { ownerId: string | null; createdBy: string | null }) {
  return isManager(actor) || p.ownerId === actor.user.id || p.createdBy === actor.user.id;
}

export async function createProject(actor: Actor, raw: unknown) {
  assertNotGuest(actor);
  const input = projectInput.parse(raw);
  return withScope(actor.scope, async (tx) => {
    const ownerId = input.ownerId ?? actor.user.id;
    await assertStaffUsers(tx, [ownerId]);
    const [p] = await tx
      .insert(projects)
      .values({
        tenantId: actor.tenant.id,
        name: input.name,
        description: input.description,
        clientOrgId: input.clientOrgId,
        targetDate: input.targetDate,
        access: input.access,
        status: input.status,
        ownerId,
        createdBy: actor.user.id,
      })
      .returning();
    await tx.insert(projectMembers).values({ tenantId: actor.tenant.id, projectId: p.id, userId: actor.user.id }).onConflictDoNothing();
    if (ownerId !== actor.user.id)
      await tx.insert(projectMembers).values({ tenantId: actor.tenant.id, projectId: p.id, userId: ownerId }).onConflictDoNothing();
    await recordEvent(tx, actor, { type: "project.created", entityType: "project", entityId: p.id, projectId: p.id, timeline: "internal", data: { name: p.name } });
    return p;
  });
}

export async function updateProject(actor: Actor, id: string, raw: unknown) {
  assertNotGuest(actor);
  const input = projectInput.partial().parse(raw);
  return withScope(actor.scope, async (tx) => {
    const [p] = await tx.select().from(projects).where(and(eq(projects.id, id), projectVisible(actor))).limit(1);
    if (!p) throw notFound();
    if (!canManageProject(actor, p)) throw forbidden();
    if (input.ownerId) await assertStaffUsers(tx, [input.ownerId]);
    const [updated] = await tx
      .update(projects)
      .set({ ...input, ownerId: input.ownerId === undefined ? undefined : input.ownerId, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    await recordEvent(tx, actor, {
      type: "project.updated",
      entityType: "project",
      entityId: id,
      projectId: id,
      timeline: "internal",
      data: { fields: Object.keys(input) },
    });
    return updated;
  });
}

export async function addProjectMember(actor: Actor, projectId: string, userId: string, expiresAt: Date | null = null) {
  assertNotGuest(actor);
  return withScope(actor.scope, async (tx) => {
    const [p] = await tx.select().from(projects).where(and(eq(projects.id, projectId), projectVisible(actor))).limit(1);
    if (!p) throw notFound();
    if (!canManageProject(actor, p)) throw forbidden();
    await assertStaffUsers(tx, [userId]);
    await tx.insert(projectMembers).values({ tenantId: actor.tenant.id, projectId, userId, expiresAt }).onConflictDoNothing();
    await recordEvent(tx, actor, { type: "project.member_added", entityType: "project", entityId: projectId, data: { userId } });
  });
}

export async function removeProjectMember(actor: Actor, projectId: string, userId: string) {
  assertNotGuest(actor);
  return withScope(actor.scope, async (tx) => {
    const [p] = await tx.select().from(projects).where(and(eq(projects.id, projectId), projectVisible(actor))).limit(1);
    if (!p) throw notFound();
    if (!canManageProject(actor, p)) throw forbidden();
    await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    await recordEvent(tx, actor, { type: "project.member_removed", entityType: "project", entityId: projectId, data: { userId } });
  });
}

export async function projectOptions(actor: Actor) {
  if (!actor.isStaff) return [];
  return withScope(actor.scope, (tx) =>
    tx
      .select({ id: projects.id, name: projects.name, clientOrgId: projects.clientOrgId })
      .from(projects)
      .where(and(projectVisible(actor), sql`${projects.status} not in ('archived','completed')`))
      .orderBy(asc(projects.name)),
  );
}


/** Files, linked requests and activity for the project tabs (all visibility-checked by getProject first). */
export async function projectExtras(actor: Actor, id: string) {
  await getProject(actor, id);
  return withScope(actor.scope, async (tx) => {
    const files = await tx
      .select()
      .from(schema.attachments)
      .where(sql`${schema.attachments.projectId} = ${id} or ${schema.attachments.taskId} in (select t.id from tasks t where t.project_id = ${id})`)
      .orderBy(desc(schema.attachments.createdAt));
    const reqs = await tx
      .select({ id: schema.requests.id, publicRef: schema.requests.publicRef, title: schema.requests.title, status: schema.requests.status })
      .from(schema.requests)
      .where(eq(schema.requests.projectId, id));
    const events = await tx
      .select({ id: schema.activity.id, type: schema.activity.type, data: schema.activity.data, createdAt: schema.activity.createdAt, actorName: users.name })
      .from(schema.activity)
      .leftJoin(users, eq(users.id, schema.activity.actorId))
      .where(eq(schema.activity.projectId, id))
      .orderBy(desc(schema.activity.createdAt))
      .limit(60);
    return { files: files.filter((f) => f.scanState === "clean"), requests: reqs, events };
  });
}
