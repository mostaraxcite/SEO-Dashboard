import "server-only";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { withScope, systemDb, schema } from "../db";
import type { Actor } from "../context";
import { assertManager } from "../authz";
import { businessMinutesBetween, type Calendar } from "../sla/business-time";

/** A handful of actionable numbers. Nobody is scored by task count. */
export async function managerReport(actor: Actor) {
  assertManager(actor);
  const [cal] = await systemDb().select().from(schema.businessCalendars).where(eq(schema.businessCalendars.tenantId, actor.tenant.id));
  const calendar: Calendar = { timezone: cal.timezone, workDays: cal.workDays, startMinute: cal.startMinute, endMinute: cal.endMinute, holidays: cal.holidays };
  return withScope(actor.scope, async (tx) => {
    const r = schema.requests;
    const byClient = await tx
      .select({ name: sql<string>`coalesce(${schema.clientOrganizations.name}, '—')`, open: sql<number>`count(*)::int`, waiting: sql<number>`count(*) filter (where ${r.status} = 'needs_info')::int` })
      .from(r)
      .leftJoin(schema.clientOrganizations, eq(schema.clientOrganizations.id, r.clientOrgId))
      .where(inArray(r.status, ["new", "triage", "needs_info", "accepted", "in_progress", "in_review", "ready_to_deliver"]))
      .groupBy(schema.clientOrganizations.name)
      .orderBy(sql`count(*) desc`);
    const delivered = await tx
      .select({ deliveredAt: r.deliveredAt, committed: r.committedDueDate })
      .from(r)
      .where(and(isNotNull(r.deliveredAt), isNotNull(r.committedDueDate)));
    const onTime = delivered.length
      ? Math.round((delivered.filter((d) => d.deliveredAt!.toISOString().slice(0, 10) <= d.committed!).length / delivered.length) * 100)
      : null;
    const responded = await tx.select({ s: r.submittedAt, f: r.firstResponseAt }).from(r).where(isNotNull(r.firstResponseAt));
    const mins = responded.map((x) => businessMinutesBetween(x.s, x.f!, calendar)).sort((a, b) => a - b);
    const medianFirstResponseHours = mins.length ? Math.round((mins[Math.floor(mins.length / 2)] / 60) * 10) / 10 : null;
    const [tp] = await tx.select({ n: sql<number>`count(*)::int` }).from(r).where(gt(r.deliveredAt, new Date(Date.now() - 7 * 86400000)));
    const [tot] = await tx.select({ n: sql<number>`count(*)::int`, reopened: sql<number>`count(*) filter (where ${r.reopenedCount} > 0)::int` }).from(r).where(isNotNull(r.deliveredAt));
    const today = new Date().toISOString().slice(0, 10);
    const byOwner = await tx
      .select({
        name: sql<string>`coalesce(${schema.users.name}, '—')`,
        open: sql<number>`count(*)::int`,
        late: sql<number>`count(*) filter (where ${schema.tasks.dueDate} < ${today})::int`,
        blocked: sql<number>`count(*) filter (where exists (select 1 from dependencies d where d.task_id = ${schema.tasks.id} and d.status = 'open' and d.blocking))::int`,
      })
      .from(schema.tasks)
      .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
      .where(sql`${schema.tasks.status} <> 'done'`)
      .groupBy(schema.users.name)
      .orderBy(sql`count(*) desc`);
    const lateDeps = await tx
      .select({ partyType: schema.dependencies.partyType, n: sql<number>`count(*)::int` })
      .from(schema.dependencies)
      .where(and(eq(schema.dependencies.status, "open"), sql`${schema.dependencies.dueDate} < ${today}`))
      .groupBy(schema.dependencies.partyType);
    const [breached] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.slaInstances).where(eq(schema.slaInstances.status, "breached"));
    return {
      byClient,
      onTime,
      medianFirstResponseHours,
      waitingOnClient: byClient.reduce((a, c) => a + Number(c.waiting), 0),
      throughput7d: Number(tp.n),
      reopenedPct: Number(tot.n) ? Math.round((Number(tot.reopened) / Number(tot.n)) * 100) : null,
      byOwner,
      lateDependencies: { client: lateDeps.filter((d) => d.partyType === "client").reduce((a, d) => a + Number(d.n), 0), internal: lateDeps.filter((d) => d.partyType !== "client").reduce((a, d) => a + Number(d.n), 0) },
      slaBreached: Number(breached?.n ?? 0),
    };
  });
}

/** CSV export of requests (manager only, tenant-scoped under RLS). Formula-injection safe. */
export async function requestsCsv(actor: Actor) {
  assertManager(actor);
  const rows = await withScope(actor.scope, (tx) =>
    tx
      .select({
        ref: schema.requests.publicRef,
        title: schema.requests.title,
        client: schema.clientOrganizations.name,
        status: schema.requests.status,
        requested: schema.requests.requestedDueDate,
        committed: schema.requests.committedDueDate,
        submitted: schema.requests.submittedAt,
        delivered: schema.requests.deliveredAt,
        owner: schema.users.name,
      })
      .from(schema.requests)
      .leftJoin(schema.clientOrganizations, eq(schema.clientOrganizations.id, schema.requests.clientOrgId))
      .leftJoin(schema.users, eq(schema.users.id, schema.requests.ownerId))
      .orderBy(schema.requests.number),
  );
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["reference", "title", "client", "status", "requested_due", "committed_due", "submitted_at", "delivered_at", "owner"];
  return [header.join(","), ...rows.map((r) => [r.ref, r.title, r.client, r.status, r.requested, r.committed, r.submitted, r.delivered, r.owner].map(cell).join(","))].join("\n");
}
