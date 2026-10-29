import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { withScope, schema, type Tx } from "../db";
import type { Actor } from "../context";
import { assertRequestsMode, assertStaff, isManager, requestVisible } from "../authz";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { recordEvent } from "../events";
import { assertStaffUsers } from "./people";
import { insertAttachments, prepareUploads, type IncomingFile } from "./files";
import * as v from "../validation";
import type { CategoryField, InternalRequestStatus } from "../db/schema";

const { requests, users, clientOrganizations, serviceCategories, publicMessages, internalComments, attachments, activity, deliverables, approvals, dependencies, tasks, projects, slaInstances } = schema;

export type PublicStatus = "received" | "under_review" | "in_progress" | "waiting_on_you" | "delivered" | "closed" | "declined";

/** Client-friendly grouping of the internal lifecycle (spec §4.3). */
export function publicStatus(s: InternalRequestStatus, pendingApproval = false): PublicStatus {
  switch (s) {
    case "new":
      return "received";
    case "triage":
      return "under_review";
    case "needs_info":
      return "waiting_on_you";
    case "delivered":
      return pendingApproval ? "waiting_on_you" : "delivered";
    case "closed":
      return "closed";
    case "declined":
      return "declined";
    default:
      return "in_progress";
  }
}

const ACTIVE: InternalRequestStatus[] = ["accepted", "in_progress", "in_review", "ready_to_deliver"];
const OPEN: InternalRequestStatus[] = ["new", "triage", "needs_info", ...ACTIVE];

// ─── Intake ─────────────────────────────────────────────────────────────

export const submitInput = z.object({
  categoryId: v.nullableId,
  title: v.text(160),
  objective: v.text(500),
  details: v.optionalText(5000),
  linkUrl: v.url,
  requestedDueDate: v.day,
  requestedFlexible: v.checkbox,
  clientOrgId: v.nullableId.optional(),
  answers: z.record(z.string(), z.string().max(500)).default({}),
});

function validateAnswers(fields: CategoryField[], answers: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = (answers[f.key] ?? "").trim();
    if (!raw) continue;
    if (f.showWhen && (answers[f.showWhen.field] ?? "") !== f.showWhen.equals) continue;
    if (f.type === "select" && !f.options?.some((o) => o.value === raw)) throw invalid("invalid", { field: f.key });
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw invalid("invalid", { field: f.key });
    out[f.key] = raw.slice(0, 500);
  }
  return out;
}

/**
 * Creates a request from the 5 shared questions (+ optional category follow-ups).
 * Client contacts always submit for their own client organization (server-derived).
 */
export async function submitRequest(actor: Actor, raw: unknown, files: IncomingFile[] = []) {
  assertRequestsMode(actor);
  if (actor.role === "guest") throw forbidden();
  const input = submitInput.parse(raw);
  const prepared = await prepareUploads(actor.tenant.id, files);
  return withScope(actor.scope, async (tx) => {
    const clientOrgId = actor.isStaff ? (input.clientOrgId ?? null) : actor.clientOrgId;
    if (actor.isStaff && clientOrgId) {
      const ok = await tx.select({ id: clientOrganizations.id }).from(clientOrganizations).where(eq(clientOrganizations.id, clientOrgId));
      if (!ok.length) throw notFound();
    }
    let category: typeof serviceCategories.$inferSelect | undefined;
    if (input.categoryId) {
      [category] = await tx.select().from(serviceCategories).where(and(eq(serviceCategories.id, input.categoryId), eq(serviceCategories.enabled, true)));
      if (!category) throw invalid("invalid", { field: "categoryId" });
    }
    const answers = category ? validateAnswers(category.fields, input.answers) : {};
    const [{ n }] = await tx.execute<{ n: number }>(sql`select next_request_number() as n`);
    const [tenant] = await tx.select({ prefix: schema.tenants.requestPrefix }).from(schema.tenants).where(eq(schema.tenants.id, actor.tenant.id));
    const [req] = await tx
      .insert(requests)
      .values({
        tenantId: actor.tenant.id,
        number: Number(n),
        publicRef: `${tenant.prefix}-${n}`,
        clientOrgId,
        requesterId: actor.user.id,
        categoryId: category?.id ?? null,
        title: input.title,
        objective: input.objective,
        details: input.details ?? "",
        linkUrl: input.linkUrl,
        requestedDueDate: input.requestedFlexible ? null : input.requestedDueDate,
        requestedFlexible: input.requestedFlexible || !input.requestedDueDate,
        ownerId: category?.defaultOwnerId ?? null,
        answers,
        formSnapshot: { categoryKey: category?.key ?? null, categoryVersion: category?.version ?? null, fields: category?.fields ?? [] },
        status: "new",
      })
      .returning();
    await insertAttachments(tx, actor, prepared, { requestId: req.id, clientOrgId, visibility: "client" });
    await recordEvent(tx, actor, {
      type: "request.submitted",
      entityType: "request",
      entityId: req.id,
      requestId: req.id,
      clientOrgId,
      timeline: "public",
      data: { ref: req.publicRef },
      notify: { dedupeKey: `request.submitted:${req.id}`, payload: { ref: req.publicRef, title: req.title, submittedAt: req.submittedAt.toISOString() } },
    });
    return req;
  });
}

// ─── Lists ──────────────────────────────────────────────────────────────

export async function triageCount(actor: Actor) {
  if (actor.tenant.mode !== "requests" || !isManager(actor)) return 0;
  return withScope(actor.scope, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(requests).where(inArray(requests.status, ["new", "triage"]));
    return Number(r?.n ?? 0);
  });
}

const listColumns = {
  id: requests.id,
  publicRef: requests.publicRef,
  title: requests.title,
  status: requests.status,
  priority: requests.priority,
  requestedDueDate: requests.requestedDueDate,
  requestedFlexible: requests.requestedFlexible,
  committedDueDate: requests.committedDueDate,
  committedFlexible: requests.committedFlexible,
  clientOrgId: requests.clientOrgId,
  clientName: clientOrganizations.name,
  ownerId: requests.ownerId,
  ownerName: users.name,
  updatedAt: requests.updatedAt,
  submittedAt: requests.submittedAt,
  categoryKey: serviceCategories.key,
  categoryEn: serviceCategories.labelEn,
  categoryAr: serviceCategories.labelAr,
  pendingApproval: sql<boolean>`exists (select 1 from approvals a where a.request_id = ${requests.id} and a.status = 'pending')`,
  openDeps: sql<number>`(select count(*)::int from dependencies d where d.request_id = ${requests.id} and d.status = 'open')`,
  slaStatus: sql<string | null>`(select case when bool_or(s.status = 'breached') then 'breached' when bool_or(s.warned_at is not null and s.status in ('running','paused')) then 'at_risk' when bool_or(s.status in ('running','paused')) then 'on_track' else null end from sla_instances s where s.request_id = ${requests.id})`,
};

export type RequestRow = Awaited<ReturnType<typeof listRequests>>[number];

export async function listRequests(
  actor: Actor,
  filter: { tab?: "triage" | "waiting" | "active" | "done" | "all"; clientOrgId?: string | null; q?: string | null; mine?: boolean } = {},
) {
  assertRequestsMode(actor);
  return withScope(actor.scope, async (tx) => {
    const statusFilter =
      filter.tab === "triage"
        ? inArray(requests.status, ["new", "triage"])
        : filter.tab === "waiting"
          ? eq(requests.status, "needs_info")
          : filter.tab === "active"
            ? inArray(requests.status, ACTIVE)
            : filter.tab === "done"
              ? inArray(requests.status, ["delivered", "closed", "declined"])
              : undefined;
    return tx
      .select(listColumns)
      .from(requests)
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, requests.clientOrgId))
      .leftJoin(users, eq(users.id, requests.ownerId))
      .leftJoin(serviceCategories, eq(serviceCategories.id, requests.categoryId))
      .where(
        and(
          actor.isStaff ? requestVisible(actor) : undefined,
          statusFilter,
          filter.clientOrgId ? eq(requests.clientOrgId, filter.clientOrgId) : undefined,
          filter.mine ? eq(requests.requesterId, actor.user.id) : undefined,
          filter.q ? or(ilike(requests.title, `%${escapeLike(filter.q)}%`), ilike(requests.publicRef, `%${escapeLike(filter.q)}%`)) : undefined,
        ),
      )
      .orderBy(
        filter.tab === "triage" ? asc(requests.submittedAt) : desc(requests.updatedAt),
      )
      .limit(200);
  });
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c).slice(0, 100);

// ─── Detail ─────────────────────────────────────────────────────────────

async function loadByRef(tx: Tx, actor: Actor, ref: string) {
  const [r] = await tx
    .select({ r: requests, clientName: clientOrganizations.name, categoryEn: serviceCategories.labelEn, categoryAr: serviceCategories.labelAr, categoryKey: serviceCategories.key })
    .from(requests)
    .leftJoin(clientOrganizations, eq(clientOrganizations.id, requests.clientOrgId))
    .leftJoin(serviceCategories, eq(serviceCategories.id, requests.categoryId))
    .where(and(eq(requests.publicRef, ref.slice(0, 40)), actor.isStaff ? requestVisible(actor) : undefined))
    .limit(1);
  if (!r) throw notFound();
  return r;
}

/** Everything a client may see about one request. Internal tables are never queried. */
export async function getRequestForClient(actor: Actor, ref: string) {
  assertRequestsMode(actor);
  if (actor.isStaff) throw forbidden();
  return withScope(actor.scope, async (tx) => {
    const row = await loadByRef(tx, actor, ref);
    const id = row.r.id;
    const [messages, files, timeline, delivs, pending] = await Promise.all([
      tx
        .select({ id: publicMessages.id, body: publicMessages.body, kind: publicMessages.kind, authorKind: publicMessages.authorKind, createdAt: publicMessages.createdAt, authorName: users.name })
        .from(publicMessages)
        .leftJoin(users, eq(users.id, publicMessages.authorId))
        .where(eq(publicMessages.requestId, id))
        .orderBy(asc(publicMessages.createdAt)),
      tx.select().from(attachments).where(eq(attachments.requestId, id)).orderBy(asc(attachments.createdAt)),
      tx
        .select({ id: activity.id, type: activity.type, data: activity.data, createdAt: activity.createdAt, actorName: users.name })
        .from(activity)
        .leftJoin(users, eq(users.id, activity.actorId))
        .where(eq(activity.requestId, id))
        .orderBy(desc(activity.createdAt))
        .limit(40),
      tx.select().from(deliverables).where(eq(deliverables.requestId, id)).orderBy(desc(deliverables.version)),
      tx.select().from(approvals).where(and(eq(approvals.requestId, id), eq(approvals.status, "pending"))).limit(1),
    ]);
    const owner = row.r.ownerId ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, row.r.ownerId)))[0] : null;
    const requester = (await tx.select({ name: users.name }).from(users).where(eq(users.id, row.r.requesterId)))[0];
    const r = row.r;
    return {
      id: r.id,
      publicRef: r.publicRef,
      title: r.title,
      objective: r.objective,
      details: r.details,
      linkUrl: r.linkUrl,
      answers: r.answers,
      formSnapshot: r.formSnapshot,
      categoryEn: row.categoryEn,
      categoryAr: row.categoryAr,
      clientName: row.clientName,
      status: r.status,
      publicStatus: publicStatus(r.status, pending.length > 0),
      requestedDueDate: r.requestedDueDate,
      requestedFlexible: r.requestedFlexible,
      // Committed date is only meaningful after acceptance.
      committedDueDate: r.triagedAt ? r.committedDueDate : null,
      committedFlexible: r.triagedAt ? r.committedFlexible : false,
      pendingQuestion: r.status === "needs_info" ? r.pendingQuestion : null,
      declineReason: r.status === "declined" ? r.declineReasonPublic : null,
      ownerName: r.triagedAt ? (owner?.name ?? null) : null,
      requesterName: requester?.name ?? null,
      submittedAt: r.submittedAt,
      deliveredAt: r.deliveredAt,
      reviewWindowEndsAt: r.reviewWindowEndsAt,
      messages,
      files: files.filter((f) => !f.deliverableId),
      deliverables: delivs.map((d) => ({ ...d, files: files.filter((f) => f.deliverableId === d.id) })),
      pendingApproval: pending[0] ?? null,
      timeline,
    };
  });
}

export async function getRequestForStaff(actor: Actor, ref: string) {
  assertRequestsMode(actor);
  assertStaff(actor);
  return withScope(actor.scope, async (tx) => {
    const row = await loadByRef(tx, actor, ref);
    const id = row.r.id;
    const [messages, notes, files, timeline, delivs, approvalRows, deps, sla, requester, project] = await Promise.all([
      tx
        .select({ id: publicMessages.id, body: publicMessages.body, kind: publicMessages.kind, authorKind: publicMessages.authorKind, createdAt: publicMessages.createdAt, authorName: users.name })
        .from(publicMessages)
        .leftJoin(users, eq(users.id, publicMessages.authorId))
        .where(eq(publicMessages.requestId, id))
        .orderBy(asc(publicMessages.createdAt)),
      tx
        .select({ id: internalComments.id, body: internalComments.body, createdAt: internalComments.createdAt, authorName: users.name })
        .from(internalComments)
        .leftJoin(users, eq(users.id, internalComments.authorId))
        .where(eq(internalComments.requestId, id))
        .orderBy(asc(internalComments.createdAt)),
      tx.select().from(attachments).where(eq(attachments.requestId, id)).orderBy(asc(attachments.createdAt)),
      tx
        .select({ id: activity.id, type: activity.type, data: activity.data, createdAt: activity.createdAt, actorName: users.name, visibility: activity.visibility })
        .from(activity)
        .leftJoin(users, eq(users.id, activity.actorId))
        .where(eq(activity.requestId, id))
        .orderBy(desc(activity.createdAt))
        .limit(60),
      tx.select().from(deliverables).where(eq(deliverables.requestId, id)).orderBy(desc(deliverables.version)),
      tx.select().from(approvals).where(eq(approvals.requestId, id)).orderBy(desc(approvals.createdAt)),
      tx
        .select({ d: dependencies, ownerName: users.name })
        .from(dependencies)
        .leftJoin(users, eq(users.id, dependencies.ownerId))
        .where(eq(dependencies.requestId, id))
        .orderBy(asc(dependencies.createdAt)),
      tx.select().from(slaInstances).where(eq(slaInstances.requestId, id)),
      tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, row.r.requesterId)),
      row.r.projectId ? tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, row.r.projectId)) : Promise.resolve([]),
    ]);
    const owner = row.r.ownerId ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, row.r.ownerId)))[0] : null;
    const pending = approvalRows.find((a) => a.status === "pending") ?? null;
    return {
      ...row.r,
      clientName: row.clientName,
      categoryEn: row.categoryEn,
      categoryAr: row.categoryAr,
      categoryKey: row.categoryKey,
      ownerName: owner?.name ?? null,
      requesterName: requester[0]?.name ?? null,
      requesterEmail: requester[0]?.email ?? null,
      project: project[0] ?? null,
      publicStatus: publicStatus(row.r.status, !!pending),
      messages,
      notes,
      files: files.filter((f) => !f.deliverableId),
      deliverables: delivs.map((d) => ({ ...d, files: files.filter((f) => f.deliverableId === d.id) })),
      approvals: approvalRows,
      pendingApproval: pending,
      dependencies: deps.map((d) => ({ ...d.d, ownerName: d.ownerName })),
      sla,
      timeline,
      canTriage: isManager(actor),
      canWork: isManager(actor) || row.r.ownerId === actor.user.id,
    };
  });
}

// ─── Triage & workflow ──────────────────────────────────────────────────

async function lockRequest(tx: Tx, actor: Actor, id: string) {
  const [r] = await tx
    .select()
    .from(requests)
    .where(and(eq(requests.id, id), actor.isStaff ? requestVisible(actor) : undefined))
    .for("update")
    .limit(1);
  if (!r) throw notFound();
  return r;
}

function assertCanWork(actor: Actor, r: { ownerId: string | null }) {
  if (!actor.isStaff) throw forbidden();
  if (!isManager(actor) && r.ownerId !== actor.user.id) throw forbidden();
}

function assertStatus(r: { status: InternalRequestStatus }, allowed: InternalRequestStatus[]) {
  if (!allowed.includes(r.status)) throw new AppError("conflict", "invalid_transition");
}

/** Marks the first public, non-automated staff reply (SLA first response). */
async function markFirstResponse(tx: Tx, r: typeof requests.$inferSelect) {
  if (r.firstResponseAt) return;
  const now = new Date();
  await tx.update(requests).set({ firstResponseAt: now }).where(eq(requests.id, r.id));
  await tx
    .update(slaInstances)
    .set({ metAt: now, status: sql`case when ${slaInstances.status} = 'breached' then 'breached' else 'met' end` })
    .where(and(eq(slaInstances.requestId, r.id), eq(slaInstances.metric, "first_response"), inArray(slaInstances.status, ["running", "paused"])));
}

async function markTriaged(tx: Tx, r: typeof requests.$inferSelect) {
  const now = new Date();
  await tx
    .update(slaInstances)
    .set({ metAt: now, status: sql`case when ${slaInstances.status} = 'breached' then 'breached' else 'met' end` })
    .where(and(eq(slaInstances.requestId, r.id), eq(slaInstances.metric, "triage"), inArray(slaInstances.status, ["running", "paused"])));
}

async function postPublic(tx: Tx, actor: Actor, r: typeof requests.$inferSelect, body: string, kind: "message" | "question" | "answer" | "update") {
  const [m] = await tx
    .insert(publicMessages)
    .values({ tenantId: actor.tenant.id, clientOrgId: r.clientOrgId, requestId: r.id, authorId: actor.user.id, authorKind: actor.isStaff ? "staff" : "client", kind, body })
    .returning();
  return m;
}

const acceptInput = z.object({
  ownerId: v.nullableId,
  committedDueDate: v.day,
  committedFlexible: v.checkbox,
  priority: z.enum(["normal", "high"]).default("normal"),
  projectId: v.nullableId.optional(),
  note: v.optionalText(4000),
});

export async function acceptRequest(actor: Actor, id: string, raw: unknown) {
  assertStaff(actor);
  if (!isManager(actor)) throw forbidden();
  const input = acceptInput.parse(raw);
  if (!input.ownerId) throw invalid("owner_required", { field: "ownerId" });
  if (!input.committedFlexible && !input.committedDueDate) throw invalid("commitment_required", { field: "committedDueDate" });
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertStatus(r, ["new", "triage", "needs_info"]);
    await assertStaffUsers(tx, [input.ownerId]);
    if (input.projectId) await assertProjectMatches(tx, input.projectId, r.clientOrgId);
    const now = new Date();
    const [u] = await tx
      .update(requests)
      .set({
        status: "accepted",
        ownerId: input.ownerId,
        committedDueDate: input.committedFlexible ? null : input.committedDueDate,
        committedFlexible: input.committedFlexible,
        priority: input.priority,
        projectId: input.projectId ?? r.projectId,
        pendingQuestion: null,
        triagedAt: r.triagedAt ?? now,
        updatedAt: now,
        revision: r.revision + 1,
      })
      .where(eq(requests.id, id))
      .returning();
    await markTriaged(tx, r);
    if (input.note) {
      await postPublic(tx, actor, r, input.note, "update");
      await markFirstResponse(tx, r);
    }
    await recordEvent(tx, actor, {
      type: "request.accepted",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      data: { committedDueDate: u.committedDueDate, flexible: u.committedFlexible, ownerId: u.ownerId },
      notify: { dedupeKey: `request.accepted:${id}:r${u.revision}`, payload: { ref: r.publicRef, title: r.title, ownerId: u.ownerId, committedDueDate: u.committedDueDate } },
    });
    return u;
  });
}

async function assertProjectMatches(tx: Tx, projectId: string, clientOrgId: string | null) {
  const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw notFound();
  if ((p.clientOrgId ?? null) !== (clientOrgId ?? null)) throw invalid("invalid", { field: "projectId", reason: "client mismatch" });
}

export async function requestInfo(actor: Actor, id: string, question: string) {
  assertStaff(actor);
  const q = v.text(2000).parse(question);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    if (!isManager(actor) && r.ownerId !== actor.user.id) throw forbidden();
    assertStatus(r, ["new", "triage", ...ACTIVE]);
    const now = new Date();
    const [u] = await tx.update(requests).set({ status: "needs_info", pendingQuestion: q, updatedAt: now, revision: r.revision + 1 }).where(eq(requests.id, id)).returning();
    const m = await postPublic(tx, actor, r, q, "question");
    await markFirstResponse(tx, r);
    await recordEvent(tx, actor, {
      type: "request.needs_info",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      notify: { dedupeKey: `request.needs_info:${m.id}`, payload: { ref: r.publicRef, title: r.title } },
    });
    return u;
  });
}

export async function declineRequest(actor: Actor, id: string, raw: unknown) {
  assertStaff(actor);
  if (!isManager(actor)) throw forbidden();
  const input = z.object({ reasonPublic: v.text(1000), reasonInternal: v.optionalText(2000) }).parse(raw);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertStatus(r, ["new", "triage", "needs_info"]);
    const now = new Date();
    const [u] = await tx
      .update(requests)
      .set({ status: "declined", declineReasonPublic: input.reasonPublic, declineReasonInternal: input.reasonInternal || null, triagedAt: r.triagedAt ?? now, closedAt: now, updatedAt: now, revision: r.revision + 1 })
      .where(eq(requests.id, id))
      .returning();
    await postPublic(tx, actor, r, input.reasonPublic, "update");
    await markFirstResponse(tx, r);
    await markTriaged(tx, r);
    await recordEvent(tx, actor, {
      type: "request.declined",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      notify: { dedupeKey: `request.declined:${id}`, payload: { ref: r.publicRef, title: r.title } },
    });
    if (input.reasonInternal) await tx.insert(internalComments).values({ tenantId: actor.tenant.id, requestId: id, authorId: actor.user.id, body: input.reasonInternal });
    return u;
  });
}

/** Requester replies. If the team asked a question, the request returns to triage (or to work, keeping its commitment). */
export async function clientReply(actor: Actor, id: string, body: string) {
  assertRequestsMode(actor);
  if (actor.isStaff) throw forbidden();
  const text = v.text(4000).parse(body);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    if (["closed", "declined"].includes(r.status)) throw new AppError("conflict", "invalid_transition");
    const wasQuestion = r.status === "needs_info";
    const m = await postPublic(tx, actor, r, text, wasQuestion ? "answer" : "message");
    const next: InternalRequestStatus = wasQuestion ? (r.triagedAt ? "in_progress" : "triage") : r.status;
    await tx
      .update(requests)
      .set({ status: next, pendingQuestion: wasQuestion ? null : r.pendingQuestion, updatedAt: new Date(), revision: wasQuestion ? r.revision + 1 : r.revision })
      .where(eq(requests.id, id));
    await recordEvent(tx, actor, {
      type: wasQuestion ? "request.answered" : "request.client_message",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: wasQuestion ? "public" : null,
      notify: { dedupeKey: `request.client_message:${m.id}`, payload: { ref: r.publicRef, title: r.title, ownerId: r.ownerId } },
    });
    return m;
  });
}

export async function staffReply(actor: Actor, id: string, body: string) {
  assertStaff(actor);
  const text = v.text(4000).parse(body);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    const m = await postPublic(tx, actor, r, text, "message");
    await markFirstResponse(tx, r);
    await tx.update(requests).set({ updatedAt: new Date() }).where(eq(requests.id, id));
    await recordEvent(tx, actor, {
      type: "request.public_reply",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      notify: { dedupeKey: `request.public_reply:${m.id}`, payload: { ref: r.publicRef, title: r.title } },
    });
    return m;
  });
}

export async function addRequestNote(actor: Actor, id: string, body: string) {
  assertStaff(actor);
  const text = v.text(10000).parse(body);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    const [c] = await tx.insert(internalComments).values({ tenantId: actor.tenant.id, requestId: r.id, authorId: actor.user.id, body: text }).returning();
    await recordEvent(tx, actor, { type: "request.note", entityType: "request", entityId: id, data: { commentId: c.id } });
    return c;
  });
}

const STATUS_FLOW: Partial<Record<InternalRequestStatus, InternalRequestStatus[]>> = {
  accepted: ["in_progress"],
  in_progress: ["in_review", "ready_to_deliver"],
  in_review: ["in_progress", "ready_to_deliver"],
  ready_to_deliver: ["in_progress", "in_review"],
};

export async function setRequestStatus(actor: Actor, id: string, to: string) {
  const target = z.enum(["in_progress", "in_review", "ready_to_deliver"]).parse(to);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertCanWork(actor, r);
    if (!STATUS_FLOW[r.status]?.includes(target)) throw new AppError("conflict", "invalid_transition");
    const [u] = await tx.update(requests).set({ status: target, updatedAt: new Date(), revision: r.revision + 1 }).where(eq(requests.id, id)).returning();
    // Only the client-meaningful transition (work started) is shown on the public timeline.
    await recordEvent(tx, actor, {
      type: "request.status_changed",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: r.status === "accepted" && target === "in_progress" ? "public" : "internal",
      data: { from: r.status, to: target },
    });
    return u;
  });
}

export async function changeCommitment(actor: Actor, id: string, raw: unknown) {
  const input = z.object({ committedDueDate: v.day, committedFlexible: v.checkbox, reason: v.text(1000) }).parse(raw);
  if (!input.committedFlexible && !input.committedDueDate) throw invalid("commitment_required");
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertCanWork(actor, r);
    assertStatus(r, [...ACTIVE, "needs_info"]);
    if (!r.triagedAt) throw new AppError("conflict", "invalid_transition");
    const [u] = await tx
      .update(requests)
      .set({ committedDueDate: input.committedFlexible ? null : input.committedDueDate, committedFlexible: input.committedFlexible, updatedAt: new Date(), revision: r.revision + 1 })
      .where(eq(requests.id, id))
      .returning();
    await postPublic(tx, actor, r, input.reason, "update");
    await recordEvent(tx, actor, {
      type: "request.commitment_changed",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      data: { from: r.committedDueDate, to: u.committedDueDate, flexible: u.committedFlexible },
      notify: { dedupeKey: `request.commitment_changed:${id}:r${u.revision}`, payload: { ref: r.publicRef, title: r.title, ownerId: r.ownerId } },
    });
    return u;
  });
}

export async function linkProject(actor: Actor, id: string, projectId: string | null) {
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertCanWork(actor, r);
    if (projectId) await assertProjectMatches(tx, projectId, r.clientOrgId);
    await tx.update(requests).set({ projectId, updatedAt: new Date() }).where(eq(requests.id, id));
    if (projectId) await tx.update(tasks).set({ projectId }).where(and(eq(tasks.requestId, id), sql`${tasks.projectId} is null`));
    await recordEvent(tx, actor, { type: "request.linked_project", entityType: "request", entityId: id, requestId: id, timeline: "internal", data: { projectId } });
  });
}

export async function closeRequest(actor: Actor, id: string) {
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertCanWork(actor, r);
    assertStatus(r, ["delivered"]);
    const now = new Date();
    await tx.update(requests).set({ status: "closed", closedAt: now, updatedAt: now, revision: r.revision + 1 }).where(eq(requests.id, id));
    await tx.update(approvals).set({ status: "superseded" }).where(and(eq(approvals.requestId, id), eq(approvals.status, "pending")));
    await recordEvent(tx, actor, { type: "request.closed", entityType: "request", entityId: id, requestId: id, clientOrgId: r.clientOrgId, timeline: "public" });
  });
}

export async function reopenRequest(actor: Actor, id: string, reason: string) {
  const text = v.text(1000).parse(reason);
  return withScope(actor.scope, async (tx) => {
    const r = await lockRequest(tx, actor, id);
    assertCanWork(actor, r);
    assertStatus(r, ["delivered", "closed"]);
    const [u] = await tx
      .update(requests)
      .set({ status: "in_progress", closedAt: null, reopenedCount: r.reopenedCount + 1, updatedAt: new Date(), revision: r.revision + 1 })
      .where(eq(requests.id, id))
      .returning();
    await tx.update(approvals).set({ status: "superseded" }).where(and(eq(approvals.requestId, id), eq(approvals.status, "pending")));
    await postPublic(tx, actor, r, text, "update");
    await recordEvent(tx, actor, {
      type: "request.reopened",
      entityType: "request",
      entityId: id,
      requestId: id,
      clientOrgId: r.clientOrgId,
      timeline: "public",
      notify: { dedupeKey: `request.reopened:${id}:r${u.revision}`, payload: { ref: r.publicRef, title: r.title, ownerId: r.ownerId } },
    });
  });
}

export async function portalHome(actor: Actor) {
  assertRequestsMode(actor);
  return withScope(actor.scope, async (tx) => {
    const cats = await tx.select().from(serviceCategories).where(eq(serviceCategories.enabled, true)).orderBy(asc(serviceCategories.position));
    const recent = await tx
      .select(listColumns)
      .from(requests)
      .leftJoin(clientOrganizations, eq(clientOrganizations.id, requests.clientOrgId))
      .leftJoin(users, eq(users.id, requests.ownerId))
      .leftJoin(serviceCategories, eq(serviceCategories.id, requests.categoryId))
      .orderBy(desc(requests.updatedAt))
      .limit(6);
    const [pending] = await tx.select({ n: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, "pending"));
    return { categories: cats, recent, pendingApprovals: Number(pending?.n ?? 0) };
  });
}

export const OPEN_STATUSES = OPEN;
