import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { assertStaff, requestVisible, taskVisible } from "../authz";
import { invalid, notFound } from "../errors";
import { recordEvent } from "../events";
import { assertStaffUsers } from "./people";
import * as v from "../validation";

const { dependencies, requests, tasks } = schema;

export const dependencyInput = z.object({
  requestId: v.nullableId,
  taskId: v.nullableId,
  title: v.text(200),
  partyType: z.enum(["team", "department", "client", "external"]),
  partyName: v.text(120),
  ownerId: v.nullableId,
  dueDate: v.day,
  impact: v.optionalText(1000),
  blocking: v.checkbox,
});

/** Tracks something needed from another team, department, the client or an outside party. */
export async function createDependency(actor: Actor, raw: unknown) {
  assertStaff(actor);
  const input = dependencyInput.parse(raw);
  if (!input.requestId && !input.taskId) throw invalid();
  return withScope(actor.scope, async (tx) => {
    let requestId = input.requestId;
    if (input.taskId) {
      const [t] = await tx.select().from(tasks).where(and(eq(tasks.id, input.taskId), taskVisible(actor)));
      if (!t) throw notFound();
      requestId = requestId ?? t.requestId;
    }
    let ref: string | null = null;
    if (requestId) {
      const [r] = await tx.select().from(requests).where(and(eq(requests.id, requestId), requestVisible(actor)));
      if (!r) throw notFound();
      ref = r.publicRef;
    }
    await assertStaffUsers(tx, [input.ownerId]);
    const [d] = await tx
      .insert(dependencies)
      .values({ tenantId: actor.tenant.id, ...input, requestId, impact: input.impact ?? "", createdBy: actor.user.id })
      .returning();
    await recordEvent(tx, actor, {
      type: "dependency.created",
      entityType: "dependency",
      entityId: d.id,
      requestId,
      taskId: d.taskId,
      timeline: "internal",
      data: { party: d.partyName, title: d.title },
      notify:
        d.ownerId && d.ownerId !== actor.user.id
          ? { dedupeKey: `dependency.assigned:${d.id}:${d.ownerId}`, payload: { ownerId: d.ownerId, title: d.title, ref } }
          : undefined,
    });
    return d;
  });
}

export async function resolveDependency(actor: Actor, id: string) {
  assertStaff(actor);
  return withScope(actor.scope, async (tx) => {
    const [d] = await tx.select().from(dependencies).where(eq(dependencies.id, id));
    if (!d) throw notFound();
    if (d.taskId) {
      const [t] = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, d.taskId), taskVisible(actor)));
      if (!t) throw notFound();
    } else if (d.requestId) {
      const [r] = await tx.select({ id: requests.id }).from(requests).where(and(eq(requests.id, d.requestId), requestVisible(actor)));
      if (!r) throw notFound();
    }
    await tx.update(dependencies).set({ status: "resolved", resolvedAt: new Date() }).where(eq(dependencies.id, id));
    await recordEvent(tx, actor, { type: "dependency.resolved", entityType: "dependency", entityId: id, requestId: d.requestId, taskId: d.taskId, timeline: "internal", data: { party: d.partyName } });
  });
}
