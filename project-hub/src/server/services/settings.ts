import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { assertAdmin } from "../authz";
import { recordEvent } from "../events";
import { invalid } from "../errors";
import { checkbox } from "../validation";

/** Which AI controls to render. The server re-checks on every call regardless. */
export const aiEnabledFor = cache(async (actor: Actor) => {
  const [s] = await withScope(actor.scope, (tx) => tx.select().from(schema.aiSettings).where(eq(schema.aiSettings.tenantId, actor.tenant.id)));
  const on = !!s?.enabled && (actor.isStaff || s.clientsMayUse);
  return {
    enabled: on,
    summarize: on && !!s?.features.summarize,
    improve_brief: on && !!s?.features.improve_brief,
    suggest_tasks: on && actor.isStaff && !!s?.features.suggest_tasks,
    next_steps: on && actor.isStaff && !!s?.features.next_steps,
  };
});



export async function readSettings(actor: Actor) {
  assertAdmin(actor);
  return withScope(actor.scope, async (tx) => {
    const [ai] = await tx.select().from(schema.aiSettings).where(eq(schema.aiSettings.tenantId, actor.tenant.id));
    const [ns] = await tx.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.tenantId, actor.tenant.id));
    const [sla] = await tx.select().from(schema.slaPolicies).where(eq(schema.slaPolicies.tenantId, actor.tenant.id));
    const [cal] = await tx.select().from(schema.businessCalendars).where(eq(schema.businessCalendars.tenantId, actor.tenant.id));
    const deliveries = await tx
      .select({ d: schema.notificationDeliveries, email: schema.users.email })
      .from(schema.notificationDeliveries)
      .leftJoin(schema.users, eq(schema.users.id, schema.notificationDeliveries.userId))
      .orderBy(desc(schema.notificationDeliveries.createdAt))
      .limit(40);
    const audit = await tx
      .select({ a: schema.auditLogs, name: schema.users.name })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(40);
    return { ai, ns, sla, cal, deliveries, audit };
  });
}

const hours = z.coerce.number().min(0.5).max(400);

export async function updateSla(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = z
    .object({
      firstResponseHours: hours,
      triageHours: hours,
      warnAtPercent: z.coerce.number().int().min(10).max(99),
      pauseTriageOnNeedsInfo: checkbox,
      workDays: z.array(z.coerce.number().int().min(1).max(7)).or(z.coerce.number().int().min(1).max(7).transform((n) => [n])).default([]),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      holidays: z.string().max(4000).default(""),
    })
    .parse(raw);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = toMin(input.startTime), end = toMin(input.endTime);
  if (end <= start || !input.workDays.length) throw invalid();
  const holidays = input.holidays.split(/\s+/).filter(Boolean);
  if (holidays.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h))) throw invalid("invalid", { field: "holidays" });
  return withScope(actor.scope, async (tx) => {
    await tx
      .update(schema.slaPolicies)
      .set({ firstResponseMinutes: Math.round(input.firstResponseHours * 60), triageMinutes: Math.round(input.triageHours * 60), warnAtPercent: input.warnAtPercent, pauseTriageOnNeedsInfo: input.pauseTriageOnNeedsInfo, updatedAt: new Date() })
      .where(eq(schema.slaPolicies.tenantId, actor.tenant.id));
    await tx
      .update(schema.businessCalendars)
      .set({ workDays: [...new Set(input.workDays)].sort(), startMinute: start, endMinute: end, holidays, updatedAt: new Date() })
      .where(eq(schema.businessCalendars.tenantId, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.sla", entityType: "tenant", entityId: actor.tenant.id, data: { firstResponseHours: input.firstResponseHours, triageHours: input.triageHours } });
  });
}

export async function updateNotificationSettings(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = z
    .object({
      emailEnabled: checkbox,
      inAppEnabled: checkbox,
      smsEnabled: checkbox,
      senderId: z.string().trim().max(11).regex(/^[A-Za-z0-9 -]*$/).default(""),
      monthlySegmentQuota: z.coerce.number().int().min(0).max(1_000_000),
      recipientCooldownMinutes: z.coerce.number().int().min(0).max(10_000),
      costPerSegmentUsd: z.coerce.number().min(0).max(5),
      allowedEvents: z.array(z.enum(["request.delivered", "approval.requested"])).or(z.enum(["request.delivered", "approval.requested"]).transform((x) => [x])).default([]),
    })
    .parse(raw);
  return withScope(actor.scope, async (tx) => {
    const [cur] = await tx.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.tenantId, actor.tenant.id));
    const [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, actor.tenant.id));
    await tx
      .update(schema.notificationSettings)
      .set({
        emailEnabled: input.emailEnabled,
        inAppEnabled: input.inAppEnabled,
        sms: {
          ...cur.sms,
          enabled: input.smsEnabled,
          // Only the mock provider exists in this build; a live provider is a deployment decision.
          provider: input.smsEnabled ? "mock" : cur.sms.provider,
          senderId: input.senderId || null,
          monthlySegmentQuota: input.monthlySegmentQuota,
          recipientCooldownMinutes: input.recipientCooldownMinutes,
          costPerSegmentUsd: input.costPerSegmentUsd,
          allowedEvents: input.allowedEvents,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.notificationSettings.tenantId, actor.tenant.id));
    await tx.update(schema.tenants).set({ features: { ...tenant.features, sms: input.smsEnabled } }).where(eq(schema.tenants.id, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.notifications", entityType: "tenant", entityId: actor.tenant.id, data: { sms: input.smsEnabled, quota: input.monthlySegmentQuota } });
  });
}

export async function updateAiSettings(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = z
    .object({
      enabled: checkbox,
      summarize: checkbox,
      improve_brief: checkbox,
      suggest_tasks: checkbox,
      next_steps: checkbox,
      clientsMayUse: checkbox,
      monthlyActionLimit: z.coerce.number().int().min(0).max(100000),
      monthlySpendCapUsd: z.coerce.number().min(0).max(100000),
      perUserHourlyLimit: z.coerce.number().int().min(0).max(1000),
    })
    .parse(raw);
  return withScope(actor.scope, async (tx) => {
    await tx
      .update(schema.aiSettings)
      .set({
        enabled: input.enabled,
        features: { summarize: input.summarize, improve_brief: input.improve_brief, suggest_tasks: input.suggest_tasks, next_steps: input.next_steps },
        clientsMayUse: input.clientsMayUse,
        monthlyActionLimit: input.monthlyActionLimit,
        monthlySpendCapUsd: input.monthlySpendCapUsd.toFixed(2),
        perUserHourlyLimit: input.perUserHourlyLimit,
        updatedAt: new Date(),
      })
      .where(eq(schema.aiSettings.tenantId, actor.tenant.id));
    await recordEvent(tx, actor, { type: "settings.ai", entityType: "tenant", entityId: actor.tenant.id, data: { enabled: input.enabled } });
  });
}
