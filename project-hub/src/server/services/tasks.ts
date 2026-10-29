import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withScope, schema, type Tx } from "../db";
import type { Actor } from "../context";
import { assertStaff, isManager, projectVisible, requestVisible, taskVisible } from "../authz";
import { forbidden, invalid, notFound } from "../errors";
import { recordEvent } from "../events";
import { assertStaffUsers } from "./people";
import * as v from "../validation";
import { todayIn } from "@/i18n";
import type { TaskStatus } from "../db/schema";

const { tasks, projects, requests, users, internalComments, dependencies, attachments, activity, clientOrganizations } = schema;

export const taskCreateInput = z.object({
  title: v.text(240),
  description: v.optionalText(10000),
  projectId: v.nullableId,
  requestId: v.nullableId,
  parentTaskId: v.nullableId,
  assigneeId: v.nullableId,
  dueDate: v.day,
  teamLabel: z.preprocess((x) => (x === "" ? null : x), z.string().trim().max(60).nullable()).optional(),
});

export const taskUpdateInput = z
  .object({
    title: v.text(240),
    description: v.optionalText(10000),
    status: z.enum(["todo", "in_progress", "review", "done"]),
    assigneeId: v.nullableId,
    dueDate: v.day,
    projectId: v.nullableId,
  })
  .partial();

/** Loads parents the actor can see and derives the client org a new task inherits. */
async function resolveParents(tx: Tx, actor: Actor, input: { projectId: string | null; requestId: string | null; parentTaskId: string | null }) {
  let projectId = input.projectId;
  let requestId = input.requestId;
  let clientOrgId: string | null = null;
  if (input.parentTaskId) {
    const [parent] = await tx.select().from(tasks).where(and(eq(tasks.id, input.parentTaskId), taskVisible(actor))).limit(1);
    if (!parent) throw notFound();
    if (parent.parentTaskId) throw invalid("invalid", { reason: "one level of subtasks" });
    projectId = parent.projectId;
    requestId = parent.requestId;
    clientOrgId = parent.clientOrgId;
  }
  if (projectId) {
    const [p] = await tx.select().from(projects).where(and(eq(projects.id, projectId), projectVisible(actor))).limit(1);
    if (!p) throw notFound();
    clientOrgId = clientOrgId ?? p.clientOrgId;
  }
  if (requestId) {
    const [r] = await tx.select().from(requests).where(and(eq(requests.id, requestId), requestVisible(actor))).limit(1);
    if (!r) throw notFound();
    if (clientOrgId && r.clientOrgId && clientOrgId !== r.clientOrgId) throw invalid("invalid", { reason: "client mismatch" });
    clientOrgId = r.clientOrgId ?? clientOrgId;
    projectId = projectId ?? r.projectId;
  }
  return { projectId, requestId, clientOrgId };
}

/** Restricted projects: the assignee must be able to see the task, so add them as a member. */
async function ensureAssigneeAccess(tx: Tx, actor: Actor, projectId: string | null, assigneeId: string | null) {
  if (!projectId || !assigneeId) return;
  const [p] = await tx.select({ access: projects.access }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (p?.access === "members") {
    await tx.insert(schema.projectMembers).values({ tenantId: actor.tenant.id, projectId, userId: assigneeId }).onConflictDoNothing();
  }
}

export async function createTask(actor: Actor, raw: unknown) {
  assertStaff(actor);
  const input = taskCreateInput.parse(raw);
  return withScope(actor.scope, (tx) => createTaskTx(tx, actor, input));
}

export async function createTaskTx(tx: Tx, actor: Actor, input: z.infer<typeof taskCreateInput>, meta: Record<string, unknown> = {}) {
  const parents = await resolveParents(tx, actor, input);
  if (actor.role === "guest" && !parents.projectId) throw forbidden();
  await assertStaffUsers(tx, [input.assigneeId]);
  const [{ pos }] = await tx
    .select({ pos: sql<number>`coalesce(max(${tasks.position}), 0) + 1` })
    .from(tasks)
    .where(parents.projectId ? eq(tasks.projectId, parents.projectId) : isNull(tasks.projectId));
  const [task] = await tx
    .insert(tasks)
    .values({
      tenantId: actor.tenant.id,
      title: input.title,
      description: input.description ?? "",
      projectId: parents.projectId,
      requestId: parents.requestId,
      parentTaskId: input.parentTaskId,
      clientOrgId: parents.clientOrgId,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate,
      teamLabel: input.teamLabel ?? null,
      position: Number(pos),
      createdBy: actor.user.id,
    })
    .returning();
  await ensureAssigneeAccess(tx, actor, task.projectId, task.assigneeId);
  await recordEvent(tx, actor, {
    type: task.parentTaskId ? "task.subtask_created" : "task.created",
    entityType: "task",
    entityId: task.id,
    taskId: task.parentTaskId ?? task.id,
    projectId: task.projectId,
    requestId: task.requestId,
    timeline: "internal",
    data: { title: task.title, ...meta },
  });
  if (task.assigneeId && task.assigneeId !== actor.user.id) {
    await recordEvent(tx, actor, {
      type: "task.assigned",
      entityType: "task",
      entityId: task.id,
      taskId: task.id,
      notify: { dedupeKey: `task.assigned:${task.id}:${task.assigneeId}:r${task.revision}`, payload: { assigneeId: task.assigneeId, title: task.title } },
    });
  }
  return task;
}

export async function updateTask(actor: Actor, id: string, raw: unknown) {
  assertStaff(actor);
  const input = taskUpdateInput.parse(raw);
  return withScope(actor.scope, async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), taskVisible(actor))).limit(1);
    if (!task) throw notFound();
    if (input.assigneeId) await assertStaffUsers(tx, [input.assigneeId]);
    const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date(), revision: task.revision + 1 };
    if (input.projectId !== undefined && input.projectId !== task.projectId) {
      if (input.projectId) {
        const [p] = await tx.select().from(projects).where(and(eq(projects.id, input.projectId), projectVisible(actor))).limit(1);
        if (!p) throw notFound();
        if (task.requestId && p.clientOrgId && task.clientOrgId && p.clientOrgId !== task.clientOrgId) throw invalid();
        patch.clientOrgId = task.requestId ? task.clientOrgId : p.clientOrgId;
      } else if (!task.requestId) {
        patch.clientOrgId = null;
      }
      patch.projectId = input.projectId;
    }
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.status !== undefined && input.status !== task.status) {
      patch.status = input.status;
      patch.completedAt = input.status === "done" ? new Date() : null;
    }
    const [updated] = await tx.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    await ensureAssigneeAccess(tx, actor, updated.projectId, updated.assigneeId);
    const base = { entityType: "task", entityId: id, taskId: task.parentTaskId ?? id, projectId: updated.projectId, timeline: "internal" as const };
    if (patch.status) await recordEvent(tx, actor, { ...base, type: "task.status_changed", data: { from: task.status, to: patch.status } });
    if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
      const name = input.assigneeId ? (await tx.select({ n: users.name }).from(users).where(eq(users.id, input.assigneeId)))[0]?.n : null;
      await recordEvent(tx, actor, {
        ...base,
        type: "task.assigned",
        data: { assignee: name ?? null },
        notify:
          input.assigneeId && input.assigneeId !== actor.user.id
            ? { dedupeKey: `task.assigned:${id}:${input.assigneeId}:r${updated.revision}`, payload: { assigneeId: input.assigneeId, title: updated.title } }
            : undefined,
      });
    }
    if (input.dueDate !== undefined && input.dueDate !== task.dueDate)
      await recordEvent(tx, actor, { ...base, type: "task.due_changed", data: { from: task.dueDate, to: input.dueDate } });
    if (input.title !== undefined || input.description !== undefined)
      if (input.title !== task.title || input.description !== task.description) await recordEvent(tx, actor, { ...base, type: "task.updated", timeline: null });
    return updated;
  });
}

export async function deleteTask(actor: Actor, id: string) {
  assertStaff(actor);
  return withScope(actor.scope, async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), taskVisible(actor))).limit(1);
    if (!task) throw notFound();
    if (!isManager(actor) && task.createdBy !== actor.user.id) throw forbidden();
    await tx.delete(tasks).where(eq(tasks.id, id));
    await recordEvent(tx, actor, { type: "task.deleted", entityType: "task", entityId: id, data: { title: task.title } });
    return task;
  });
}

export async function addTaskComment(actor: Actor, taskId: string, body: string) {
  assertStaff(actor);
  const text = v.text(10000).parse(body);
  return withScope(actor.scope, async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), taskVisible(actor))).limit(1);
    if (!task) throw notFound();
    const [c] = await tx.insert(internalComments).values({ tenantId: actor.tenant.id, taskId, authorId: actor.user.id, body: text }).returning();
    await tx.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await recordEvent(tx, actor, { type: "task.comment", entityType: "task", entityId: taskId, data: { commentId: c.id } });
    return c;
  });
}

const taskListColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  dueDate: tasks.dueDate,
  assigneeId: tasks.assigneeId,
  assigneeName: users.name,
  projectId: tasks.projectId,
  projectName: projects.name,
  requestId: tasks.requestId,
  requestRef: requests.publicRef,
  clientName: clientOrganizations.name,
  parentTaskId: tasks.parentTaskId,
  teamLabel: tasks.teamLabel,
  position: tasks.position,
  updatedAt: tasks.updatedAt,
  subtaskCount: sql<number>`(select count(*)::int from tasks s where s.parent_task_id = ${tasks.id})`,
  subtaskDone: sql<number>`(select count(*)::int from tasks s where s.parent_task_id = ${tasks.id} and s.status = 'done')`,
  blocked: sql<boolean>`exists (select 1 from dependencies d where d.task_id = ${tasks.id} and d.status = 'open' and d.blocking)`,
  commentCount: sql<number>`(select count(*)::int from internal_comments c where c.task_id = ${tasks.id})`,
};
export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
  requestId: string | null;
  requestRef: string | null;
  clientName: string | null;
  parentTaskId: string | null;
  teamLabel: string | null;
  position: number;
  updatedAt: Date;
  subtaskCount: number;
  subtaskDone: number;
  blocked: boolean;
  commentCount: number;
};

function taskListQuery(tx: Tx) {
  return tx
    .select(taskListColumns)
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(requests, eq(requests.id, tasks.requestId))
    .leftJoin(clientOrganizations, eq(clientOrganizations.id, tasks.clientOrgId));
}

export async function listTasks(
  actor: Actor,
  filter: { projectId?: string; requestId?: string; assigneeId?: string; includeDone?: boolean; topLevelOnly?: boolean },
): Promise<TaskRow[]> {
  if (!actor.isStaff) return [];
  return withScope(actor.scope, async (tx) => {
    const rows = await taskListQuery(tx)
      .where(
        and(
          taskVisible(actor),
          filter.projectId ? eq(tasks.projectId, filter.projectId) : undefined,
          filter.requestId ? eq(tasks.requestId, filter.requestId) : undefined,
          filter.assigneeId ? eq(tasks.assigneeId, filter.assigneeId) : undefined,
          filter.includeDone === false ? sql`${tasks.status} <> 'done'` : undefined,
          filter.topLevelOnly === false ? undefined : isNull(tasks.parentTaskId),
        ),
      )
      .orderBy(asc(sql`case ${tasks.status} when 'done' then 1 else 0 end`), asc(tasks.position), asc(tasks.createdAt));
    return rows as TaskRow[];
  });
}

/** Team home: my open tasks grouped for action, plus a few counters that link to filtered lists. */
export async function myWork(actor: Actor) {
  assertStaff(actor);
  const today = todayIn(actor.tenant.timezone);
  const soon = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86400000).toISOString().slice(0, 10);
  return withScope(actor.scope, async (tx) => {
    const mine = (await taskListQuery(tx)
      .where(and(eq(tasks.assigneeId, actor.user.id), sql`${tasks.status} <> 'done'`))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))) as TaskRow[];
    const recentlyDone = (await taskListQuery(tx)
      .where(and(eq(tasks.assigneeId, actor.user.id), eq(tasks.status, "done"), sql`${tasks.completedAt} > now() - interval '7 days'`))
      .orderBy(desc(tasks.completedAt))
      .limit(5)) as TaskRow[];
    const overdue = mine.filter((t) => t.dueDate && t.dueDate < today);
    const attention = mine.filter((t) => (t.dueDate && t.dueDate < today) || t.blocked || t.status === "review");
    const attentionIds = new Set(attention.map((t) => t.id));
    const dueSoon = mine.filter((t) => !attentionIds.has(t.id) && t.dueDate && t.dueDate <= soon);
    const later = mine.filter((t) => !attentionIds.has(t.id) && !(t.dueDate && t.dueDate <= soon));

    let needsTriage = 0;
    if (actor.tenant.mode === "requests" && isManager(actor)) {
      const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(requests).where(inArray(requests.status, ["new", "triage"]));
      needsTriage = Number(r?.n ?? 0);
    }
    const myDeps = await tx
      .select({ id: dependencies.id, title: dependencies.title, partyName: dependencies.partyName, dueDate: dependencies.dueDate, taskId: dependencies.taskId, requestId: dependencies.requestId, requestRef: requests.publicRef })
      .from(dependencies)
      .leftJoin(requests, eq(requests.id, dependencies.requestId))
      .where(and(eq(dependencies.ownerId, actor.user.id), eq(dependencies.status, "open")))
      .orderBy(sql`${dependencies.dueDate} asc nulls last`);
    return {
      today,
      attention,
      dueSoon,
      later,
      recentlyDone,
      myDependencies: myDeps,
      counts: { needsTriage, assigned: mine.length, dueSoon: mine.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= soon).length, overdue: overdue.length },
    };
  });
}

export async function getTask(actor: Actor, id: string) {
  assertStaff(actor);
  if (!z.uuid().safeParse(id).success) throw notFound();
  return withScope(actor.scope, async (tx) => {
    const [row] = await tx
      .select({ t: tasks, projectName: projects.name, projectAccess: projects.access, requestRef: requests.publicRef, requestTitle: requests.title, clientName: clientOrganizations.name })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(requests, eq(requests.id, tasks.requestId))
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, tasks.clientOrgId))
      .where(and(eq(tasks.id, id), taskVisible(actor)))
      .limit(1);
    if (!row) throw notFound();
    const [subtasks, comments, files, deps, events, parent] = await Promise.all([
      taskListQuery(tx).where(eq(tasks.parentTaskId, id)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
      tx
        .select({ id: internalComments.id, body: internalComments.body, createdAt: internalComments.createdAt, authorId: internalComments.authorId, authorName: users.name })
        .from(internalComments)
        .leftJoin(users, eq(users.id, internalComments.authorId))
        .where(eq(internalComments.taskId, id))
        .orderBy(asc(internalComments.createdAt)),
      tx.select().from(attachments).where(eq(attachments.taskId, id)).orderBy(desc(attachments.createdAt)),
      tx
        .select({ d: dependencies, ownerName: users.name })
        .from(dependencies)
        .leftJoin(users, eq(users.id, dependencies.ownerId))
        .where(eq(dependencies.taskId, id))
        .orderBy(asc(dependencies.createdAt)),
      tx
        .select({ id: activity.id, type: activity.type, data: activity.data, createdAt: activity.createdAt, actorName: users.name })
        .from(activity)
        .leftJoin(users, eq(users.id, activity.actorId))
        .where(eq(activity.taskId, id))
        .orderBy(desc(activity.createdAt))
        .limit(50),
      row.t.parentTaskId ? tx.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, row.t.parentTaskId)).limit(1) : Promise.resolve([]),
    ]);
    const assignee = row.t.assigneeId ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, row.t.assigneeId)))[0] : null;
    return {
      ...row.t,
      projectName: row.projectName,
      requestRef: row.requestRef,
      requestTitle: row.requestTitle,
      clientName: row.clientName,
      assigneeName: assignee?.name ?? null,
      parent: parent[0] ?? null,
      subtasks: subtasks as TaskRow[],
      comments,
      files,
      dependencies: deps.map((d) => ({ ...d.d, ownerName: d.ownerName })),
      events,
    };
  });
}
