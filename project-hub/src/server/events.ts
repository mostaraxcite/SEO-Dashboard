import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "./db";
import { schema } from "./db";
import type { Actor } from "./context";

export type DomainEvent = {
  type: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  clientOrgId?: string | null;
  /** When set, a timeline row is written with this visibility. */
  timeline?: "public" | "internal" | null;
  data?: Record<string, unknown>;
  /** Queue a notification job in the same transaction (transactional outbox). */
  notify?: { dedupeKey: string; payload?: Record<string, unknown> };
};

/**
 * Writes the audit log, the optional timeline row and the optional outbox event
 * inside the caller's transaction, so they commit or roll back with the change.
 * The notification itself is produced later by the worker.
 */
export async function recordEvent(tx: Tx, actor: Actor, ev: DomainEvent) {
  const data = ev.data ?? {};
  await tx.insert(schema.auditLogs).values({
    tenantId: actor.tenant.id,
    actorId: actor.user.id,
    action: ev.type,
    entityType: ev.entityType,
    entityId: ev.entityId,
    data,
  });
  if (ev.timeline) {
    await tx.insert(schema.activity).values({
      tenantId: actor.tenant.id,
      clientOrgId: ev.clientOrgId ?? null,
      requestId: ev.requestId ?? null,
      taskId: ev.taskId ?? null,
      projectId: ev.projectId ?? null,
      actorId: actor.user.id,
      type: ev.type,
      visibility: ev.timeline,
      data,
    });
  }
  if (ev.notify) {
    const payload = {
      entityType: ev.entityType,
      entityId: ev.entityId,
      requestId: ev.requestId ?? null,
      taskId: ev.taskId ?? null,
      ...data,
      ...(ev.notify.payload ?? {}),
    };
    // SECURITY DEFINER function: inserts for the current tenant context only, idempotent on dedupe key.
    await tx.execute(sql`select enqueue_outbox(${ev.type}, ${JSON.stringify(payload)}::jsonb, ${ev.notify.dedupeKey}, ${actor.user.id}::uuid)`);
  }
}

