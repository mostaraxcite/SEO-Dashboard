import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { isManager, requestVisible } from "../authz";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { recordEvent } from "../events";
import { insertAttachments, prepareUploads, type IncomingFile } from "./files";
import * as v from "../validation";

const { requests, deliverables, approvals, publicMessages, clientContacts } = schema;

export const deliverInput = z.object({
  title: v.text(200),
  note: v.optionalText(4000),
  linkUrl: v.url,
  requestApproval: v.checkbox,
});

/**
 * The only path that tells a requester their work is ready.
 * Creates the next deliverable version, makes its files client-visible, supersedes
 * older versions/approvals and queues exactly one `request.delivered` event per version.
 */
export async function deliverRequest(actor: Actor, requestId: string, raw: unknown, files: IncomingFile[] = []) {
  if (!actor.isStaff) throw forbidden();
  const input = deliverInput.parse(raw);
  if (!files.length && !input.linkUrl && !input.note) throw invalid("deliver_needs_content");
  const prepared = await prepareUploads(actor.tenant.id, files);
  return withScope(actor.scope, async (tx) => {
    const [r] = await tx.select().from(requests).where(and(eq(requests.id, requestId), requestVisible(actor))).for("update").limit(1);
    if (!r) throw notFound();
    const owner = r.ownerId === actor.user.id;
    if (!isManager(actor) && !(owner && !actor.tenant.features.requireApprovalToDeliver)) throw forbidden();
    if (!["accepted", "in_progress", "in_review", "ready_to_deliver", "delivered"].includes(r.status)) throw new AppError("conflict", "invalid_transition");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${deliverables.version}), 0)` }).from(deliverables).where(eq(deliverables.requestId, requestId));
    const version = Number(max) + 1;
    const now = new Date();
    await tx
      .update(deliverables)
      .set({ status: "superseded" })
      // Undecided earlier versions are superseded; decided ones keep their decision as history.
      .where(and(eq(deliverables.requestId, requestId), inArray(deliverables.status, ["delivered"])));
    await tx.update(approvals).set({ status: "superseded" }).where(and(eq(approvals.requestId, requestId), eq(approvals.status, "pending")));
    const [d] = await tx
      .insert(deliverables)
      .values({
        tenantId: actor.tenant.id,
        clientOrgId: r.clientOrgId,
        requestId,
        version,
        title: input.title,
        note: input.note ?? "",
        linkUrl: input.linkUrl,
        status: "delivered",
        createdBy: actor.user.id,
        deliveredBy: actor.user.id,
        deliveredAt: now,
      })
      .returning();
    await insertAttachments(tx, actor, prepared, { requestId, deliverableId: d.id, clientOrgId: r.clientOrgId, visibility: "client" });
    let approvalId: string | null = null;
    if (input.requestApproval && actor.tenant.features.approvals) {
      const [a] = await tx
        .insert(approvals)
        .values({ tenantId: actor.tenant.id, clientOrgId: r.clientOrgId, requestId, deliverableId: d.id, version, requestedBy: actor.user.id })
        .returning();
      approvalId = a.id;
    }
    const reviewDays = actor.tenant.features.reviewWindowDays ?? 7;
    await tx
      .update(requests)
      .set({ status: "delivered", deliveredAt: now, reviewWindowEndsAt: new Date(now.getTime() + reviewDays * 86400_000), updatedAt: now, revision: r.revision + 1 })
      .where(eq(requests.id, requestId));
    if (input.note) {
      await tx.insert(publicMessages).values({ tenantId: actor.tenant.id, clientOrgId: r.clientOrgId, requestId, authorId: actor.user.id, authorKind: "staff", kind: "update", body: input.note });
    }
    await recordEvent(tx, actor, {
      type: "request.delivered",
      entityType: "request",
      entityId: requestId,
      requestId,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      data: { version, deliverableId: d.id, approvalRequested: !!approvalId },
      // One event per version: retries or double-clicks cannot notify the client twice.
      notify: { dedupeKey: `request.delivered:${requestId}:v${version}`, payload: { ref: r.publicRef, title: r.title, ownerId: r.ownerId, approvalId } },
    });
    return { deliverable: d, approvalId };
  });
}

/**
 * Client decision on a specific version. Rejects stale versions and non-approvers.
 * Requesting changes sends the request back to work without erasing history.
 */
export async function decideApproval(actor: Actor, raw: unknown) {
  const input = z
    .object({ approvalId: v.id, version: z.coerce.number().int().positive(), decision: z.enum(["approved", "changes_requested"]), note: v.optionalText(4000) })
    .parse(raw);
  if (input.decision === "changes_requested" && !input.note) throw invalid("reason_required", { field: "note" });
  return withScope(actor.scope, async (tx) => {
    const [a] = await tx.select().from(approvals).where(eq(approvals.id, input.approvalId)).for("update").limit(1);
    if (!a) throw notFound();
    if (actor.isStaff) throw forbidden();
    const [contact] = await tx.select().from(clientContacts).where(and(eq(clientContacts.userId, actor.user.id), eq(clientContacts.clientOrgId, a.clientOrgId ?? "")));
    if (!contact?.canApprove) throw forbidden();
    const [latest] = await tx.select().from(deliverables).where(eq(deliverables.requestId, a.requestId)).orderBy(desc(deliverables.version)).limit(1);
    if (a.status !== "pending" || a.version !== input.version || latest?.id !== a.deliverableId) throw new AppError("conflict", "stale_version");
    const [r] = await tx.select().from(requests).where(eq(requests.id, a.requestId)).for("update");
    const now = new Date();
    await tx.update(approvals).set({ status: input.decision, decidedBy: actor.user.id, decidedAt: now, decisionNote: input.note || null }).where(eq(approvals.id, a.id));
    await tx.update(deliverables).set({ status: input.decision }).where(eq(deliverables.id, a.deliverableId));
    if (input.note) {
      await tx.insert(publicMessages).values({ tenantId: actor.tenant.id, clientOrgId: a.clientOrgId, requestId: a.requestId, authorId: actor.user.id, authorKind: "client", kind: "message", body: input.note });
    }
    if (input.decision === "changes_requested") {
      await tx.update(requests).set({ status: "in_progress", updatedAt: now, revision: r.revision + 1 }).where(eq(requests.id, r.id));
    } else {
      await tx.update(requests).set({ updatedAt: now }).where(eq(requests.id, r.id));
    }
    await recordEvent(tx, actor, {
      type: `approval.${input.decision}`,
      entityType: "approval",
      entityId: a.id,
      requestId: a.requestId,
      clientOrgId: a.clientOrgId,
      timeline: "public",
      data: { version: a.version },
      notify: { dedupeKey: `approval.decided:${a.id}`, payload: { ref: r.publicRef, title: r.title, ownerId: r.ownerId, deliveredBy: a.requestedBy } },
    });
    return { status: input.decision };
  });
}

export async function listPendingApprovals(actor: Actor) {
  return withScope(actor.scope, (tx) =>
    tx
      .select({ id: approvals.id, version: approvals.version, createdAt: approvals.createdAt, ref: requests.publicRef, title: requests.title, deliverableTitle: deliverables.title })
      .from(approvals)
      .innerJoin(requests, eq(requests.id, approvals.requestId))
      .innerJoin(deliverables, eq(deliverables.id, approvals.deliverableId))
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.createdAt)),
  );
}

