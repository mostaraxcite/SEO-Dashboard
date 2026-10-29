import "server-only";
import { z } from "zod";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { systemDb, withScope, schema } from "../db";
import type { Actor } from "../context";
import { isManager } from "../authz";
import { AppError, forbidden, notFound } from "../errors";
import { recordEvent } from "../events";
import { getRequestForClient, getRequestForStaff } from "../services/requests";
import { getTask, listTasks, createTaskTx } from "../services/tasks";
import { listCategories } from "../services/workspace";
import { aiProvider } from "./provider";
import { AiProviderError } from "./types";
import { boundItems, digest, hasArabic, sourceIds, type AiContext, type ContextItem } from "./context";
import { PROMPT_VERSION, schemas, type Feature, type Output } from "./schemas";
import { makeT, todayIn } from "@/i18n";
import * as v from "../validation";

export type AiTarget = { kind: "request"; ref: string } | { kind: "task"; id: string } | { kind: "brief"; title: string; objective: string; details: string; requestedDue: string | null };

// ─── Context builders (permission-filtered by construction) ─────────────

function depText(locale: "en" | "ar", d: { title: string; dueDate: string | null; impact: string }) {
  const t = makeT(locale);
  return `${d.title}${d.dueDate ? ` (${t("dependency.due")}: ${d.dueDate})` : ""}${d.impact ? ` — ${t("dependency.impact")}: ${d.impact}` : ""}`;
}

async function requestContext(actor: Actor, ref: string): Promise<AiContext> {
  const locale = actor.user.locale;
  if (!actor.isStaff) {
    // Client context: only what the portal shows. No internal notes, tasks or dependencies exist here.
    const r = await getRequestForClient(actor, ref);
    const items: ContextItem[] = [
      ...r.messages.map((m) => ({ id: `msg:${m.id}`, kind: m.kind, author: m.authorName, at: m.createdAt.toISOString(), text: m.body })),
      ...r.deliverables.map((d) => ({ id: `deliv:${d.id}`, kind: "update", author: null, at: (d.deliveredAt ?? d.createdAt).toISOString(), text: `Version ${d.version} delivered: ${d.title}. ${d.note}` })),
    ];
    return {
      resourceType: "request",
      resourceId: r.id,
      revision: `request:${r.id}:${digest(items.map((i) => i.id))}`,
      locale,
      audience: "client",
      facts: {
        title: r.title,
        objective: r.objective,
        description: r.details,
        status: r.publicStatus,
        requestedDue: r.requestedDueDate,
        committedDue: r.committedDueDate,
        pendingQuestion: r.pendingQuestion,
      },
      items: boundItems(items),
    };
  }
  const r = await getRequestForStaff(actor, ref);
  const tasks = await listTasks(actor, { requestId: r.id, topLevelOnly: false });
  const today = todayIn(actor.tenant.timezone);
  const items: ContextItem[] = [
    ...r.messages.map((m) => ({ id: `msg:${m.id}`, kind: m.kind, author: m.authorName, at: m.createdAt.toISOString(), text: m.body })),
    ...r.notes.map((n) => ({ id: `note:${n.id}`, kind: "note", author: n.authorName, at: n.createdAt.toISOString(), text: n.body })),
    ...r.dependencies
      .filter((d) => d.status === "open")
      .map((d) => ({ id: `dep:${d.id}`, kind: "dependency", author: d.partyName, at: d.createdAt.toISOString(), text: depText(actor.user.locale, d) })),
    ...tasks.map((t) => ({
      id: `task:${t.id}`,
      kind: "task",
      author: t.assigneeName,
      at: t.updatedAt.toISOString(),
      text: `${t.title} [${t.status}]${t.dueDate ? ` due ${t.dueDate}` : ""}`,
      flag: (t.status === "done" ? "done" : t.dueDate && t.dueDate < today ? "overdue" : "open") as ContextItem["flag"],
    })),
  ];
  return {
    resourceType: "request",
    resourceId: r.id,
    revision: `request:${r.id}:r${r.revision}`,
    locale,
    audience: "staff",
    facts: {
      title: r.title,
      objective: r.objective,
      description: r.details,
      status: r.status,
      categoryKey: r.categoryKey ?? null,
      client: r.clientName,
      owner: r.ownerName,
      requestedDue: r.requestedDueDate,
      committedDue: r.committedDueDate,
      pendingQuestion: r.status === "needs_info" ? r.pendingQuestion : null,
      openTasks: tasks.filter((t) => t.status !== "done").length,
    },
    items: boundItems(items),
  };
}

async function taskContext(actor: Actor, id: string): Promise<AiContext> {
  if (!actor.isStaff) throw forbidden();
  const t = await getTask(actor, id);
  const today = todayIn(actor.tenant.timezone);
  const items: ContextItem[] = [
    ...t.comments.map((c) => ({ id: `comment:${c.id}`, kind: "comment", author: c.authorName, at: c.createdAt.toISOString(), text: c.body })),
    ...t.dependencies
      .filter((d) => d.status === "open")
      .map((d) => ({ id: `dep:${d.id}`, kind: "dependency", author: d.partyName, at: d.createdAt.toISOString(), text: depText(actor.user.locale, d) })),
    ...t.subtasks.map((s) => ({
      id: `task:${s.id}`,
      kind: "task",
      author: s.assigneeName,
      at: s.updatedAt.toISOString(),
      text: `${s.title} [${s.status}]${s.dueDate ? ` due ${s.dueDate}` : ""}`,
      flag: (s.status === "done" ? "done" : s.dueDate && s.dueDate < today ? "overdue" : "open") as ContextItem["flag"],
    })),
  ];
  if (t.status !== "done" && t.dueDate && t.dueDate < today) items.push({ id: `task:${t.id}`, kind: "task", author: t.assigneeName, at: t.updatedAt.toISOString(), text: `${t.title} [${t.status}] due ${t.dueDate}`, flag: "overdue" });
  return {
    resourceType: "task",
    resourceId: t.id,
    revision: `task:${t.id}:r${t.revision}:c${t.comments.length}`,
    locale: actor.user.locale,
    audience: "staff",
    facts: {
      title: t.title,
      description: t.description,
      status: t.status,
      assignee: t.assigneeName,
      due: t.dueDate,
      project: t.projectName,
      request: t.requestRef,
      openTasks: t.subtasks.filter((s) => s.status !== "done").length,
    },
    items: boundItems(items),
  };
}

async function briefContext(actor: Actor, target: Extract<AiTarget, { kind: "brief" }>): Promise<AiContext> {
  const input = z
    .object({ title: z.string().max(400), objective: z.string().max(1000), details: z.string().max(5000), requestedDue: v.day })
    .parse(target);
  const cats = await listCategories(actor);
  const ar = hasArabic(`${input.title} ${input.objective} ${input.details}`);
  return {
    resourceType: "brief",
    resourceId: null,
    revision: `brief:${digest(input)}`,
    locale: ar ? "ar" : actor.user.locale,
    audience: actor.isStaff ? "staff" : "client",
    facts: { title: input.title, objective: input.objective, details: input.details, requestedDue: input.requestedDue },
    items: [],
    categories: cats.map((c) => ({ key: c.key, label: ar ? c.labelAr : c.labelEn })),
  };
}

// ─── Policy, limits and logging ─────────────────────────────────────────

async function settingsFor(actor: Actor) {
  const [s] = await withScope(actor.scope, (tx) => tx.select().from(schema.aiSettings).where(eq(schema.aiSettings.tenantId, actor.tenant.id)));
  return s;
}

function assertFeatureAllowed(actor: Actor, feature: Feature, target: AiTarget, s: Awaited<ReturnType<typeof settingsFor>>) {
  if (!s || !s.enabled) throw new AppError("unavailable", "ai_disabled");
  if (!s.features[feature]) throw new AppError("unavailable", "ai_feature_disabled");
  if (!actor.isStaff) {
    if (!s.clientsMayUse) throw new AppError("unavailable", "ai_feature_disabled");
    if (!(feature === "improve_brief" || (feature === "summarize" && target.kind === "request"))) throw forbidden();
  }
  if (feature === "improve_brief" && target.kind !== "brief") throw forbidden();
  if (feature !== "improve_brief" && target.kind === "brief") throw forbidden();
}

/** Monthly action/spend caps per tenant and an hourly cap per person. Counted from successful runs only. */
async function assertWithinLimits(actor: Actor, s: NonNullable<Awaited<ReturnType<typeof settingsFor>>>) {
  const db = systemDb();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [m] = await db
    .select({ n: sql<number>`count(*)::int`, cost: sql<string>`coalesce(sum(${schema.aiRuns.estimatedCostUsd}), 0)` })
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.tenantId, actor.tenant.id), eq(schema.aiRuns.status, "ok"), gt(schema.aiRuns.createdAt, monthStart)));
  if (Number(m.n) >= s.monthlyActionLimit || Number(m.cost) >= Number(s.monthlySpendCapUsd)) throw new AppError("rate_limited", "ai_quota");
  const [h] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.actorId, actor.user.id), inArray(schema.aiRuns.status, ["ok", "error"]), gt(schema.aiRuns.createdAt, new Date(Date.now() - 3600_000))));
  if (Number(h.n) >= s.perUserHourlyLimit) throw new AppError("rate_limited", "ai_rate");
}

async function logRun(actor: Actor, row: Omit<typeof schema.aiRuns.$inferInsert, "tenantId" | "actorId" | "clientOrgId">) {
  const [r] = await withScope(actor.scope, (tx) =>
    tx
      .insert(schema.aiRuns)
      .values({ tenantId: actor.tenant.id, actorId: actor.user.id, clientOrgId: actor.clientOrgId, ...row })
      .returning({ id: schema.aiRuns.id }),
  );
  return r.id;
}

/** Drops evidence ids the model invented: only ids present in the context survive. */
function ground<F extends Feature>(feature: F, out: Output<F>, ctx: AiContext): Output<F> {
  const ok = sourceIds(ctx);
  const keep = (ids: string[]) => ids.filter((i) => ok.has(i));
  if (feature === "summarize") {
    const o = out as Output<"summarize">;
    return { ...o, evidence: keep(o.evidence) } as Output<F>;
  }
  if (feature === "suggest_tasks") {
    const o = out as Output<"suggest_tasks">;
    return {
      ...o,
      suggestions: o.suggestions.map((s, i) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d < i) })),
      evidence: keep(o.evidence),
    } as Output<F>;
  }
  if (feature === "next_steps") {
    const o = out as Output<"next_steps">;
    return { ...o, steps: o.steps.map((s) => ({ ...s, evidence: keep(s.evidence) })) } as Output<F>;
  }
  return out;
}

export type AiRunResult<F extends Feature> = {
  draftId: string;
  output: Output<F>;
  provider: string;
  cached: boolean;
  sourceRevision: string;
  evidence: Record<string, string>;
};

/**
 * Runs one AI feature on an explicit click. Never mutates business data:
 * the result is stored as a draft owned by the actor.
 */
export async function runAi<F extends Feature>(actor: Actor, feature: F, target: AiTarget): Promise<AiRunResult<F>> {
  const s = await settingsFor(actor);
  assertFeatureAllowed(actor, feature, target, s);
  const ctx = target.kind === "request" ? await requestContext(actor, target.ref) : target.kind === "task" ? await taskContext(actor, target.id) : await briefContext(actor, target);
  if (feature === "suggest_tasks" && target.kind === "request") {
    const r = await getRequestForStaff(actor, target.ref);
    if (!r.canWork) throw forbidden();
  }
  const provider = aiProvider();
  const model = provider.modelFor(feature);
  const inputDigest = digest({ feature, v: PROMPT_VERSION[feature], model, ctx });
  const evidenceLabels = Object.fromEntries(ctx.items.map((i) => [i.id, `${i.author ? i.author + " · " : ""}${i.text.slice(0, 80)}`]));
  const resourceType = ctx.resourceType;
  const resourceId = ctx.resourceId;

  // Cache: identical permission-filtered context + model + prompt version → reuse the actor's own draft.
  const cached = await withScope(actor.scope, (tx) =>
    tx
      .select()
      .from(schema.aiDrafts)
      .where(and(eq(schema.aiDrafts.feature, feature), eq(schema.aiDrafts.inputDigest, inputDigest), gt(schema.aiDrafts.createdAt, new Date(Date.now() - 86400_000))))
      .orderBy(desc(schema.aiDrafts.createdAt))
      .limit(1),
  );
  if (cached[0] && cached[0].status === "draft") {
    await logRun(actor, { feature, resourceType, resourceId, sourceRevision: ctx.revision, inputDigest, provider: provider.name, model, promptVersion: PROMPT_VERSION[feature], status: "cached" });
    return { draftId: cached[0].id, output: cached[0].content as Output<F>, provider: provider.name, cached: true, sourceRevision: ctx.revision, evidence: evidenceLabels };
  }

  await assertWithinLimits(actor, s!);
  const started = Date.now();
  let result: Awaited<ReturnType<typeof provider.generate<F>>> | null = null;
  let lastErr: AiProviderError | null = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const r = await provider.generate(feature, ctx);
      result = { ...r, output: schemas[feature].parse(r.output) as Output<F> };
    } catch (e) {
      lastErr = e instanceof AiProviderError ? e : new AiProviderError("invalid_output", (e as Error).message);
      if (lastErr.code !== "invalid_output") break; // only retry schema failures
    }
  }
  if (!result) {
    await logRun(actor, {
      feature,
      resourceType,
      resourceId,
      sourceRevision: ctx.revision,
      inputDigest,
      provider: provider.name,
      model,
      promptVersion: PROMPT_VERSION[feature],
      status: "error",
      errorCode: lastErr?.code ?? "unknown",
      latencyMs: Date.now() - started,
    });
    throw new AppError("unavailable", lastErr?.code === "invalid_output" ? "ai_invalid_output" : "ai_unavailable");
  }
  const output = ground(feature, result.output, ctx);
  const runId = await logRun(actor, {
    feature,
    resourceType,
    resourceId,
    sourceRevision: ctx.revision,
    inputDigest,
    provider: provider.name,
    model: result.model,
    promptVersion: PROMPT_VERSION[feature],
    status: "ok",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd: result.costUsd.toFixed(6),
    latencyMs: Date.now() - started,
  });
  const [draft] = await withScope(actor.scope, (tx) =>
    tx
      .insert(schema.aiDrafts)
      .values({ tenantId: actor.tenant.id, clientOrgId: actor.clientOrgId, runId, actorId: actor.user.id, feature, resourceType, resourceId, sourceRevision: ctx.revision, inputDigest, content: output as Record<string, unknown> })
      .returning({ id: schema.aiDrafts.id }),
  );
  return { draftId: draft.id, output, provider: provider.name, cached: false, sourceRevision: ctx.revision, evidence: evidenceLabels };
}

// ─── Explicit, human-confirmed applies ──────────────────────────────────

async function ownDraft(actor: Actor, draftId: string, feature: Feature) {
  if (!z.uuid().safeParse(draftId).success) throw notFound();
  const [d] = await withScope(actor.scope, (tx) => tx.select().from(schema.aiDrafts).where(and(eq(schema.aiDrafts.id, draftId), eq(schema.aiDrafts.feature, feature))));
  if (!d) throw notFound();
  if (d.status !== "draft") throw new AppError("conflict", "conflict");
  return d;
}

export async function resolveDraft(actor: Actor, draftId: string, status: "applied" | "discarded") {
  return withScope(actor.scope, async (tx) => {
    const res = await tx
      .update(schema.aiDrafts)
      .set({ status, resolvedAt: new Date() })
      .where(and(eq(schema.aiDrafts.id, draftId), eq(schema.aiDrafts.status, "draft")))
      .returning({ id: schema.aiDrafts.id, feature: schema.aiDrafts.feature });
    if (res[0]) await recordEvent(tx, actor, { type: `ai.draft_${status}`, entityType: "ai_draft", entityId: draftId, data: { feature: res[0].feature } });
  });
}

const applyTasksInput = z.object({
  draftId: v.id,
  tasks: z
    .array(
      z.object({
        title: v.text(200),
        description: v.optionalText(2000),
        assigneeId: v.nullableId,
        dueDate: v.day,
        teamLabel: z.preprocess((x) => (x === "" || x === undefined ? null : x), z.string().trim().max(60).nullable()),
      }),
    )
    .min(1)
    .max(8),
});

/**
 * "Review & create": creates the reviewed (possibly edited) tasks in one transaction,
 * through the same authorization as manual creation, and only if the source has not
 * changed since the suggestions were generated.
 */
export async function applySuggestedTasks(actor: Actor, raw: unknown) {
  if (!actor.isStaff) throw forbidden();
  const input = applyTasksInput.parse(raw);
  const draft = await ownDraft(actor, input.draftId, "suggest_tasks");
  let currentRevision: string;
  let requestId: string | null = null;
  let taskParent: string | null = null;
  if (draft.resourceType === "request") {
    const [r] = await withScope(actor.scope, (tx) => tx.select().from(schema.requests).where(eq(schema.requests.id, draft.resourceId!)));
    if (!r) throw notFound();
    if (!isManager(actor) && r.ownerId !== actor.user.id) throw forbidden();
    currentRevision = `request:${r.id}:r${r.revision}`;
    requestId = r.id;
  } else if (draft.resourceType === "task") {
    const t = await getTask(actor, draft.resourceId!);
    currentRevision = `task:${t.id}:r${t.revision}:c${t.comments.length}`;
    taskParent = t.id;
  } else throw forbidden();
  if (currentRevision !== draft.sourceRevision) throw new AppError("conflict", "ai_stale");
  return withScope(actor.scope, async (tx) => {
    const created = [];
    for (const t of input.tasks) {
      created.push(
        await createTaskTx(
          tx,
          actor,
          { ...t, description: t.description ?? "", requestId, projectId: null, parentTaskId: taskParent },
          { source: "ai_suggestion", draftId: draft.id },
        ),
      );
    }
    await tx.update(schema.aiDrafts).set({ status: "applied", resolvedAt: new Date() }).where(eq(schema.aiDrafts.id, draft.id));
    await recordEvent(tx, actor, {
      type: "request.tasks_created",
      entityType: draft.resourceType,
      entityId: draft.resourceId!,
      requestId,
      taskId: taskParent,
      timeline: "internal",
      data: { count: created.length, source: "ai_suggestion" },
    });
    return created;
  });
}

/** Saves an (edited) AI summary as an internal note — an explicit, staff-only action. */
export async function saveSummaryAsNote(actor: Actor, raw: unknown) {
  if (!actor.isStaff) throw forbidden();
  const input = z.object({ draftId: v.id, body: v.text(4000) }).parse(raw);
  const draft = await ownDraft(actor, input.draftId, "summarize");
  return withScope(actor.scope, async (tx) => {
    const body = `${input.body}\n\n— AI summary, reviewed by ${actor.user.name}`;
    if (draft.resourceType === "task") {
      await tx.insert(schema.internalComments).values({ tenantId: actor.tenant.id, taskId: draft.resourceId, authorId: actor.user.id, body });
    } else if (draft.resourceType === "request") {
      await tx.insert(schema.internalComments).values({ tenantId: actor.tenant.id, requestId: draft.resourceId, authorId: actor.user.id, body });
    } else throw forbidden();
    await tx.update(schema.aiDrafts).set({ status: "applied", resolvedAt: new Date() }).where(eq(schema.aiDrafts.id, draft.id));
    await recordEvent(tx, actor, { type: "ai.summary_saved", entityType: draft.resourceType, entityId: draft.resourceId!, data: {} });
  });
}

export async function aiUsage(actor: Actor) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const rows = await systemDb()
    .select({ status: schema.aiRuns.status, feature: schema.aiRuns.feature, n: sql<number>`count(*)::int`, cost: sql<string>`coalesce(sum(${schema.aiRuns.estimatedCostUsd}),0)` })
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.tenantId, actor.tenant.id), gt(schema.aiRuns.createdAt, monthStart)))
    .groupBy(schema.aiRuns.status, schema.aiRuns.feature);
  return {
    ok: rows.filter((r) => r.status === "ok").reduce((a, r) => a + Number(r.n), 0),
    cached: rows.filter((r) => r.status === "cached").reduce((a, r) => a + Number(r.n), 0),
    errors: rows.filter((r) => r.status === "error").reduce((a, r) => a + Number(r.n), 0),
    cost: rows.reduce((a, r) => a + Number(r.cost), 0),
    provider: aiProvider().name,
  };
}
