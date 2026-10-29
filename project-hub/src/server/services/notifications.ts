import "server-only";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { recordEvent } from "../events";
import { DEFAULT_MATRIX, PREFERENCE_EVENTS, type Channel } from "../notify/matrix";
import { invalid } from "../errors";

const { notifications, notificationPreferences } = schema;

export async function listNotifications(actor: Actor, limit = 30) {
  return withScope(actor.scope, (tx) =>
    tx.select().from(notifications).where(eq(notifications.userId, actor.user.id)).orderBy(desc(notifications.createdAt)).limit(limit),
  );
}

export async function unreadCount(actor: Actor) {
  return withScope(actor.scope, async (tx) => {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.user.id), isNull(notifications.readAt)));
    return Number(r?.n ?? 0);
  });
}

export async function markRead(actor: Actor, id?: string) {
  return withScope(actor.scope, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, actor.user.id), isNull(notifications.readAt), id ? eq(notifications.id, id) : undefined)),
  );
}

export async function getPreferences(actor: Actor) {
  const rows = await withScope(actor.scope, (tx) => tx.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actor.user.id)));
  const audience = actor.isStaff ? "staff" : "client";
  return PREFERENCE_EVENTS.filter((e) => e.audience === audience).map((e) => {
    const channels = (["in_app", "email", "sms"] as Channel[]).filter((c) => DEFAULT_MATRIX[e.key]?.[audience]?.[c] !== undefined);
    return {
      event: e.key,
      channels: channels.map((c) => ({
        channel: c,
        mode: rows.find((r) => r.eventType === e.key && r.channel === c)?.mode ?? DEFAULT_MATRIX[e.key][audience]![c]!,
      })),
    };
  });
}

export async function setPreference(actor: Actor, raw: unknown) {
  const input = z.object({ event: z.string(), channel: z.enum(["in_app", "email", "sms"]), mode: z.enum(["immediate", "digest", "off"]) }).parse(raw);
  const audience = actor.isStaff ? "staff" : "client";
  if (DEFAULT_MATRIX[input.event]?.[audience]?.[input.channel] === undefined) throw invalid();
  if (input.channel !== "email" && input.mode === "digest") throw invalid();
  return withScope(actor.scope, async (tx) => {
    await tx
      .insert(notificationPreferences)
      .values({ tenantId: actor.tenant.id, userId: actor.user.id, eventType: input.event, channel: input.channel, mode: input.mode })
      .onConflictDoUpdate({
        target: [notificationPreferences.tenantId, notificationPreferences.userId, notificationPreferences.eventType, notificationPreferences.channel],
        set: { mode: input.mode },
      });
    await recordEvent(tx, actor, { type: "preferences.updated", entityType: "user", entityId: actor.user.id, data: input });
  });
}
