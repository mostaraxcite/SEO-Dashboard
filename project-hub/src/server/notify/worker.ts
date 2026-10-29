import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { systemDb, schema } from "../db";
import { env } from "../env";
import { makeT, type Locale } from "@/i18n";
import { DEFAULT_MATRIX, type Channel, type Mode } from "./matrix";
import { emailProvider, smsProvider, smsSegments, ProviderError } from "./providers";
import type { SmsSettings } from "../db/schema";
import { addBusinessMinutes, businessMinutesBetween, type Calendar } from "../sla/business-time";

type Ev = typeof schema.outboxEvents.$inferSelect;
type Recipient = { userId: string; audience: "client" | "staff"; type: string };

const MAX_ATTEMPTS = 5;
const backoff = (attempt: number) => new Date(Date.now() + Math.min(3600, 15 * 2 ** attempt) * 1000);

// ─── Outbox → notifications/deliveries ──────────────────────────────────

/** Claims due outbox events with SKIP LOCKED so several workers can run safely. */
export async function processOutbox(limit = 25) {
  const db = systemDb();
  await db
    .update(schema.outboxEvents)
    .set({ status: "pending" })
    .where(and(eq(schema.outboxEvents.status, "processing"), lte(schema.outboxEvents.nextAttemptAt, new Date(Date.now() - 5 * 60_000))));
  const claimed = await db.execute<{ id: string }>(sql`
    update outbox_events set status = 'processing', attempts = attempts + 1, next_attempt_at = now()
    where id in (select id from outbox_events where status = 'pending' and next_attempt_at <= now() order by created_at limit ${limit} for update skip locked)
    returning id`);
  let done = 0;
  for (const { id } of claimed) {
    const [ev] = await db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.id, id));
    try {
      await handleEvent(ev);
      await db.update(schema.outboxEvents).set({ status: "done", processedAt: new Date(), lastError: null }).where(eq(schema.outboxEvents.id, id));
      done++;
    } catch (e) {
      const dead = ev.attempts >= MAX_ATTEMPTS;
      console.error(`[outbox] ${ev.type} ${ev.id} failed (attempt ${ev.attempts})`, (e as Error).message);
      await db
        .update(schema.outboxEvents)
        .set({ status: dead ? "dead" : "pending", nextAttemptAt: backoff(ev.attempts), lastError: (e as Error).message.slice(0, 500) })
        .where(eq(schema.outboxEvents.id, id));
    }
  }
  return done;
}

async function activeMembers(tenantId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return [];
  return systemDb()
    .select({ userId: schema.memberships.userId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), inArray(schema.memberships.userId, ids), isNull(schema.memberships.disabledAt)));
}

async function managers(tenantId: string) {
  const rows = await systemDb()
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), inArray(schema.memberships.role, ["owner", "admin", "manager"]), isNull(schema.memberships.disabledAt)));
  return rows.map((r) => r.userId);
}

/** Recipients come from database state, never from the payload alone; client recipients must belong to the request's client org. */
async function resolveRecipients(ev: Ev): Promise<{ recipients: Recipient[]; request: typeof schema.requests.$inferSelect | null }> {
  const p = ev.payload as Record<string, string | null>;
  const db = systemDb();
  let request: typeof schema.requests.$inferSelect | null = null;
  if (p.requestId) {
    [request] = await db.select().from(schema.requests).where(and(eq(schema.requests.id, p.requestId), eq(schema.requests.tenantId, ev.tenantId)));
    request = request ?? null;
  }
  const staffList: { ids: (string | null | undefined)[]; type: string }[] = [];
  const clientList: { ids: (string | null | undefined)[]; type: string }[] = [];
  const t = ev.type;
  if (request) {
    const requester = request.requesterId;
    if (t === "request.submitted") {
      clientList.push({ ids: [requester], type: t });
      staffList.push({ ids: [...(await managers(ev.tenantId)), request.ownerId], type: "request.submitted.staff" });
    } else if (["request.needs_info", "request.public_reply", "request.declined"].includes(t)) {
      clientList.push({ ids: [requester], type: t });
    } else if (["request.accepted", "request.commitment_changed", "request.reopened"].includes(t)) {
      clientList.push({ ids: [requester], type: t });
      staffList.push({ ids: [request.ownerId], type: t });
    } else if (t === "request.client_message" || t === "request.answered") {
      staffList.push({ ids: request.ownerId ? [request.ownerId] : await managers(ev.tenantId), type: "request.client_message" });
    } else if (t === "request.delivered") {
      const approvers = request.clientOrgId
        ? (await db.select({ userId: schema.clientContacts.userId }).from(schema.clientContacts).where(and(eq(schema.clientContacts.clientOrgId, request.clientOrgId), eq(schema.clientContacts.canApprove, true)))).map((r) => r.userId)
        : [];
      clientList.push({ ids: [requester, ...(p.approvalId ? approvers : [])], type: t });
      staffList.push({ ids: [request.ownerId], type: "request.delivered.staff" });
    } else if (t === "approval.approved" || t === "approval.changes_requested") {
      staffList.push({ ids: [request.ownerId, p.deliveredBy], type: t });
    } else if (t === "sla.warning") {
      staffList.push({ ids: request.ownerId ? [request.ownerId] : await managers(ev.tenantId), type: t });
    } else if (t === "sla.breached") {
      staffList.push({ ids: [request.ownerId, ...(await managers(ev.tenantId))], type: t });
    }
  }
  if (t === "task.assigned") staffList.push({ ids: [p.assigneeId], type: t });
  if (t === "dependency.created" || t === "dependency.assigned") staffList.push({ ids: [p.ownerId], type: "dependency.assigned" });

  const out: Recipient[] = [];
  const seen = new Set<string>();
  const clientOrgMembers = request?.clientOrgId
    ? new Set((await db.select({ userId: schema.clientContacts.userId }).from(schema.clientContacts).where(eq(schema.clientContacts.clientOrgId, request.clientOrgId))).map((r) => r.userId))
    : new Set<string>();
  for (const group of [...clientList.map((g) => ({ ...g, aud: "client" as const })), ...staffList.map((g) => ({ ...g, aud: "staff" as const }))]) {
    const members = await activeMembers(ev.tenantId, group.ids);
    for (const m of members) {
      const isClient = m.role === "client";
      if (group.aud === "staff" && isClient) continue;
      // A client recipient must be a contact of this request's client organization.
      if (isClient && !clientOrgMembers.has(m.userId)) continue;
      // Suppress self-notifications, except the requester's own receipt.
      if (m.userId === ev.actorId && t !== "request.submitted") continue;
      if (m.userId === ev.actorId && group.aud === "staff") continue;
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      out.push({ userId: m.userId, audience: isClient ? "client" : "staff", type: group.type });
    }
  }
  return { recipients: out, request };
}

async function prefFor(tenantId: string, userId: string, event: string, channel: Channel, audience: "client" | "staff"): Promise<Mode | undefined> {
  const base = event.replace(/\.staff$/, "");
  const def = DEFAULT_MATRIX[base]?.[audience]?.[channel];
  if (def === undefined) return undefined;
  const [row] = await systemDb()
    .select({ mode: schema.notificationPreferences.mode })
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.tenantId, tenantId),
        eq(schema.notificationPreferences.userId, userId),
        eq(schema.notificationPreferences.eventType, base),
        eq(schema.notificationPreferences.channel, channel),
      ),
    );
  return row?.mode ?? def;
}

async function handleEvent(ev: Ev) {
  const db = systemDb();
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, ev.tenantId));
  if (!tenant) return;
  if (ev.type === "request.submitted" && tenant.features.sla) await startSla(ev);
  const { recipients, request } = await resolveRecipients(ev);
  const [settings] = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.tenantId, ev.tenantId));
  const p = ev.payload as Record<string, string | null>;
  const params: Record<string, string | null> = { ref: request?.publicRef ?? p.ref ?? null, title: p.title ?? request?.title ?? null, metric: p.metric ?? null };
  for (const r of recipients) {
    const href =
      r.type.startsWith("task.") && p.taskId
        ? `/w/${tenant.slug}/tasks/${p.taskId}`
        : request
          ? r.audience === "client"
            ? `/portal/${tenant.slug}/requests/${request.publicRef}`
            : `/w/${tenant.slug}/requests/${request.publicRef}`
          : r.type === "dependency.assigned" && p.taskId
            ? `/w/${tenant.slug}/tasks/${p.taskId}`
            : `/w/${tenant.slug}`;
    const inApp = await prefFor(ev.tenantId, r.userId, r.type, "in_app", r.audience);
    if (settings?.inAppEnabled !== false && inApp && inApp !== "off") {
      await db.insert(schema.notifications).values({ tenantId: ev.tenantId, userId: r.userId, eventId: ev.id, type: r.type, params, href }).onConflictDoNothing();
    }
    const email = await prefFor(ev.tenantId, r.userId, r.type, "email", r.audience);
    if (settings?.emailEnabled !== false && email && email !== "off") {
      await db
        .insert(schema.notificationDeliveries)
        .values({
          tenantId: ev.tenantId,
          eventId: ev.id,
          userId: r.userId,
          channel: "email",
          idempotencyKey: `${ev.dedupeKey}:${r.userId}:email`,
          template: r.type,
          params: { ...params, href },
          status: email === "digest" ? "digest_pending" : "queued",
        })
        .onConflictDoNothing();
    }
    if (DEFAULT_MATRIX[r.type]?.[r.audience]?.sms !== undefined) {
      await enqueueSms(ev, r, tenant, settings?.sms, params);
    }
  }
}

/** SMS is sent only if every gate passes; otherwise a `skipped` row records why (visible to admins). */
async function enqueueSms(ev: Ev, r: Recipient, tenant: typeof schema.tenants.$inferSelect, sms: SmsSettings | undefined, params: Record<string, string | null>) {
  const db = systemDb();
  const key = `${ev.dedupeKey}:${r.userId}:sms`;
  const skip = (reason: string) =>
    db
      .insert(schema.notificationDeliveries)
      .values({ tenantId: ev.tenantId, eventId: ev.id, userId: r.userId, channel: "sms", idempotencyKey: key, template: r.type, params, status: "skipped", skipReason: reason })
      .onConflictDoNothing();
  const mode = await prefFor(ev.tenantId, r.userId, r.type, "sms", r.audience);
  if (!tenant.features.sms || !sms?.enabled) return skip("sms_not_enabled");
  if (!smsProvider() || sms.provider === "none" || !sms.senderId) return skip("sms_not_configured");
  if (!sms.allowedEvents.includes(r.type)) return skip("event_not_allowed");
  if (mode !== "immediate") return skip("user_not_opted_in");
  const [consent] = await db
    .select()
    .from(schema.smsConsents)
    .where(and(eq(schema.smsConsents.tenantId, ev.tenantId), eq(schema.smsConsents.userId, r.userId), isNull(schema.smsConsents.revokedAt)))
    .orderBy(sql`${schema.smsConsents.consentedAt} desc`)
    .limit(1);
  if (!consent) return skip("no_consent");
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [used] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.notificationDeliveries.segments}),0)::int` })
    .from(schema.notificationDeliveries)
    .where(and(eq(schema.notificationDeliveries.tenantId, ev.tenantId), eq(schema.notificationDeliveries.channel, "sms"), inArray(schema.notificationDeliveries.status, ["sent", "queued", "sending"]), gt(schema.notificationDeliveries.createdAt, monthStart)));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, r.userId));
  const body = smsBody(user.locale === "ar" ? "ar" : "en", r.type, params.ref ?? "", sms.senderId);
  const segments = smsSegments(body);
  if (Number(used.n) + segments > sms.monthlySegmentQuota) return skip("quota_exceeded");
  const [recent] = await db
    .select({ id: schema.notificationDeliveries.id })
    .from(schema.notificationDeliveries)
    .where(
      and(
        eq(schema.notificationDeliveries.userId, r.userId),
        eq(schema.notificationDeliveries.channel, "sms"),
        inArray(schema.notificationDeliveries.status, ["sent", "queued", "sending"]),
        gt(schema.notificationDeliveries.createdAt, new Date(Date.now() - sms.recipientCooldownMinutes * 60_000)),
      ),
    )
    .limit(1);
  if (recent) return skip("cooldown");
  await db
    .insert(schema.notificationDeliveries)
    .values({
      tenantId: ev.tenantId,
      eventId: ev.id,
      userId: r.userId,
      channel: "sms",
      idempotencyKey: key,
      template: r.type,
      params: { ...params, phone: consent.phoneE164 },
      status: "queued",
      segments,
      estimatedCost: (segments * sms.costPerSegmentUsd).toFixed(4),
      nextAttemptAt: afterQuietHours(tenant.timezone, sms.quietHoursStart, sms.quietHoursEnd),
      consentSnapshot: { phone: consent.phoneE164, consentedAt: consent.consentedAt, source: consent.source, purpose: consent.purpose },
    })
    .onConflictDoNothing();
}

/** Minimal, non-confidential SMS copy (spec C5). No request details, no links until a domain is approved. */
export function smsBody(locale: Locale, type: string, ref: string, sender: string) {
  if (locale === "ar") return type === "approval.requested" ? `طلبك ${ref} بانتظار موافقتك. يرجى مراجعة البوابة. - ${sender}` : `تم تسليم طلبك ${ref}. يرجى الدخول إلى بوابتك لمراجعته. - ${sender}`;
  return type === "approval.requested" ? `Request ${ref} is waiting for your approval. Please review it in the portal. - ${sender}` : `Request ${ref} is ready. Sign in to review. - ${sender}`;
}

export function afterQuietHours(timeZone: string, start: number, end: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minutes = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const inQuiet = start > end ? minutes >= start || minutes < end : minutes >= start && minutes < end;
  if (!inQuiet) return now;
  const wait = (end - minutes + 1440) % 1440;
  return new Date(now.getTime() + wait * 60_000);
}

// ─── Deliveries ─────────────────────────────────────────────────────────

function emailFor(locale: Locale, d: typeof schema.notificationDeliveries.$inferSelect, workspace: string) {
  const t = makeT(locale);
  const p = d.params as Record<string, string | null>;
  const subject = t.dyn(`notifications.types.${d.template}`, { ...p, metric: p.metric ? t.dyn(`request.sla.${p.metric === "triage" ? "triage" : "firstResponse"}`) : "" }, d.template);
  const link = `${env.appUrl}${p.href ?? ""}`;
  const extra =
    d.template === "request.submitted"
      ? `\n${t("intake.successBody", { ref: p.ref ?? "" })}`
      : d.template === "request.delivered"
        ? `\n${t("deliver.help")}`
        : "";
  return { subject: `${subject} — ${workspace}`, text: `${subject}${extra}\n\n${link}\n\n— ${workspace}` };
}

/** Sends queued deliveries. A row that reached `sent` is never sent again (idempotency key + status). */
export async function processDeliveries(limit = 25) {
  const db = systemDb();
  const claimed = await db.execute<{ id: string }>(sql`
    update notification_deliveries set status = 'sending', attempts = attempts + 1
    where id in (select id from notification_deliveries where status in ('queued','failed') and next_attempt_at <= now() order by created_at limit ${limit} for update skip locked)
    returning id`);
  let sent = 0;
  for (const { id } of claimed) {
    const [d] = await db.select().from(schema.notificationDeliveries).where(eq(schema.notificationDeliveries.id, id));
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, d.userId));
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, d.tenantId));
    const locale: Locale = user.locale === "ar" ? "ar" : "en";
    const workspace = tenant.theme.displayName || tenant.name;
    try {
      let res: { provider: string; providerMessageId: string; segments?: number };
      if (d.channel === "email") {
        const m = emailFor(locale, d, workspace);
        res = await emailProvider().send({ to: user.email, subject: m.subject, text: m.text, tenantId: d.tenantId });
      } else {
        const p = d.params as Record<string, string | null>;
        const [ns] = await db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.tenantId, d.tenantId));
        const provider = smsProvider();
        if (!provider || !ns.sms.enabled || !ns.sms.senderId) {
          await db.update(schema.notificationDeliveries).set({ status: "skipped", skipReason: "sms_not_configured" }).where(eq(schema.notificationDeliveries.id, id));
          continue;
        }
        res = await provider.send({ to: p.phone!, body: smsBody(locale, d.template, p.ref ?? "", ns.sms.senderId), senderId: ns.sms.senderId, tenantId: d.tenantId });
      }
      await db
        .update(schema.notificationDeliveries)
        .set({ status: "sent", sentAt: new Date(), provider: res.provider, providerMessageId: res.providerMessageId, lastError: null, ...(res.segments ? { segments: res.segments } : {}) })
        .where(eq(schema.notificationDeliveries.id, id));
      sent++;
    } catch (e) {
      const retryable = !(e instanceof ProviderError) || e.retryable;
      const dead = !retryable || d.attempts >= MAX_ATTEMPTS;
      await db
        .update(schema.notificationDeliveries)
        .set({ status: dead ? "dead" : "failed", nextAttemptAt: backoff(d.attempts), lastError: (e as Error).message.slice(0, 500) })
        .where(eq(schema.notificationDeliveries.id, id));
    }
  }
  return sent;
}

/** One digest email per person, sent at 08:00 in the workspace time zone (or immediately with force). */
export async function sendDigests(force = false) {
  const db = systemDb();
  const pending = await db
    .select({ d: schema.notificationDeliveries, tz: schema.tenants.timezone, tenantName: schema.tenants.name, display: sql<string | null>`${schema.tenants.theme}->>'displayName'` })
    .from(schema.notificationDeliveries)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.notificationDeliveries.tenantId))
    .where(eq(schema.notificationDeliveries.status, "digest_pending"))
    .orderBy(asc(schema.notificationDeliveries.createdAt));
  const groups = new Map<string, typeof pending>();
  for (const row of pending) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: row.tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (!force && hour !== 8) continue;
    const k = `${row.d.tenantId}:${row.d.userId}`;
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  for (const rows of groups.values()) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, rows[0].d.userId));
    const t = makeT(user.locale === "ar" ? "ar" : "en");
    const workspace = rows[0].display || rows[0].tenantName;
    const lines = rows.map((r) => {
      const p = r.d.params as Record<string, string | null>;
      return `• ${t.dyn(`notifications.types.${r.d.template}`, p, r.d.template)} — ${env.appUrl}${p.href ?? ""}`;
    });
    try {
      const res = await emailProvider().send({ to: user.email, tenantId: rows[0].d.tenantId, subject: `${t("notifications.mode.digest")} — ${workspace}`, text: lines.join("\n") });
      await db
        .update(schema.notificationDeliveries)
        .set({ status: "sent", sentAt: new Date(), provider: res.provider, providerMessageId: res.providerMessageId })
        .where(inArray(schema.notificationDeliveries.id, rows.map((r) => r.d.id)));
    } catch (e) {
      console.error("[digest] failed", (e as Error).message);
    }
  }
}

// ─── SLA ────────────────────────────────────────────────────────────────

async function calendarFor(tenantId: string): Promise<Calendar> {
  const [c] = await systemDb().select().from(schema.businessCalendars).where(eq(schema.businessCalendars.tenantId, tenantId));
  return { timezone: c.timezone, workDays: c.workDays, startMinute: c.startMinute, endMinute: c.endMinute, holidays: c.holidays };
}

async function startSla(ev: Ev) {
  const db = systemDb();
  const p = ev.payload as Record<string, string>;
  const [policy] = await db.select().from(schema.slaPolicies).where(eq(schema.slaPolicies.tenantId, ev.tenantId));
  if (!policy || !p.requestId) return;
  const startedAt = new Date(p.submittedAt ?? ev.createdAt);
  await db
    .insert(schema.slaInstances)
    .values([
      { tenantId: ev.tenantId, requestId: p.requestId, metric: "first_response", targetMinutes: policy.firstResponseMinutes, startedAt },
      { tenantId: ev.tenantId, requestId: p.requestId, metric: "triage", targetMinutes: policy.triageMinutes, startedAt },
    ])
    .onConflictDoNothing();
}

/**
 * Evaluates running SLA clocks in business minutes. Warning and breach events are
 * deduplicated per instance. The triage clock pauses only while the request waits on
 * the requester (if the policy allows) — never for internal delays.
 */
export async function slaTick(now = new Date()) {
  const db = systemDb();
  const rows = await db
    .select({ s: schema.slaInstances, r: schema.requests, policy: schema.slaPolicies })
    .from(schema.slaInstances)
    .innerJoin(schema.requests, eq(schema.requests.id, schema.slaInstances.requestId))
    .innerJoin(schema.slaPolicies, eq(schema.slaPolicies.tenantId, schema.slaInstances.tenantId))
    .where(inArray(schema.slaInstances.status, ["running", "paused"]));
  const cals = new Map<string, Calendar>();
  for (const { s, r, policy } of rows) {
    const cal = cals.get(s.tenantId) ?? (await calendarFor(s.tenantId));
    cals.set(s.tenantId, cal);
    const shouldPause = s.metric === "triage" && policy.pauseTriageOnNeedsInfo && r.status === "needs_info";
    if (shouldPause && s.status === "running") {
      await db.update(schema.slaInstances).set({ status: "paused", pausedAt: now }).where(eq(schema.slaInstances.id, s.id));
      continue;
    }
    let pausedMinutes = s.pausedBusinessMinutes;
    if (!shouldPause && s.status === "paused" && s.pausedAt) {
      pausedMinutes += businessMinutesBetween(s.pausedAt, now, cal);
      await db.update(schema.slaInstances).set({ status: "running", pausedAt: null, pausedBusinessMinutes: pausedMinutes }).where(eq(schema.slaInstances.id, s.id));
    }
    if (shouldPause) continue;
    const elapsed = businessMinutesBetween(s.startedAt, now, cal) - pausedMinutes;
    const pct = (elapsed / s.targetMinutes) * 100;
    const metric = s.metric;
    if (elapsed >= s.targetMinutes && !s.breachedAt) {
      await db.update(schema.slaInstances).set({ status: "breached", breachedAt: now }).where(eq(schema.slaInstances.id, s.id));
      await db
        .insert(schema.outboxEvents)
        .values({ tenantId: s.tenantId, type: "sla.breached", dedupeKey: `sla.breached:${s.id}`, payload: { requestId: r.id, ref: r.publicRef, title: r.title, metric } })
        .onConflictDoNothing();
    } else if (pct >= policy.warnAtPercent && !s.warnedAt) {
      await db.update(schema.slaInstances).set({ warnedAt: now }).where(eq(schema.slaInstances.id, s.id));
      await db
        .insert(schema.outboxEvents)
        .values({ tenantId: s.tenantId, type: "sla.warning", dedupeKey: `sla.warning:${s.id}`, payload: { requestId: r.id, ref: r.publicRef, title: r.title, metric } })
        .onConflictDoNothing();
    }
  }
}

export function slaDueAt(startedAt: Date, targetMinutes: number, pausedMinutes: number, cal: Calendar) {
  return addBusinessMinutes(startedAt, targetMinutes + pausedMinutes, cal);
}

// ─── Review window auto-close ───────────────────────────────────────────

/** Closes delivered requests whose disclosed review window ended without a change request. */
export async function autoCloseDelivered(now = new Date()) {
  const db = systemDb();
  const due = await db
    .select()
    .from(schema.requests)
    .where(and(eq(schema.requests.status, "delivered"), lte(schema.requests.reviewWindowEndsAt, now)));
  for (const r of due) {
    await db.transaction(async (tx) => {
      const res = await tx
        .update(schema.requests)
        .set({ status: "closed", closedAt: now, updatedAt: now })
        .where(and(eq(schema.requests.id, r.id), eq(schema.requests.status, "delivered")))
        .returning({ id: schema.requests.id });
      if (!res.length) return;
      await tx.update(schema.approvals).set({ status: "superseded" }).where(and(eq(schema.approvals.requestId, r.id), eq(schema.approvals.status, "pending")));
      await tx.insert(schema.activity).values({ tenantId: r.tenantId, clientOrgId: r.clientOrgId, requestId: r.id, type: "request.closed", visibility: "public", data: { auto: true } });
      await tx.insert(schema.auditLogs).values({ tenantId: r.tenantId, action: "request.auto_closed", entityType: "request", entityId: r.id, data: {} });
    });
  }
  return due.length;
}

export async function runWorkerOnce() {
  await processOutbox();
  await processDeliveries();
  await slaTick();
  await autoCloseDelivered();
  await sendDigests();
}

