import "server-only";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { invalid } from "../errors";
import { recordEvent } from "../events";
import * as v from "../validation";

export async function getAccount(actor: Actor) {
  return withScope(actor.scope, async (tx) => {
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, actor.user.id));
    const [consent] = await tx
      .select()
      .from(schema.smsConsents)
      .where(and(eq(schema.smsConsents.userId, actor.user.id), isNull(schema.smsConsents.revokedAt)))
      .limit(1);
    return { name: u.name, email: u.email, phone: u.phoneE164, smsConsent: !!consent };
  });
}

export async function updateProfile(actor: Actor, raw: unknown) {
  const input = z.object({ name: v.text(120) }).parse(raw);
  return withScope(actor.scope, async (tx) => {
    await tx.update(schema.users).set({ name: input.name }).where(eq(schema.users.id, actor.user.id));
    await recordEvent(tx, actor, { type: "account.profile", entityType: "user", entityId: actor.user.id });
  });
}

/**
 * Stores the phone (E.164) and explicit transactional SMS consent with timestamp and source.
 * A phone is never required to submit a request.
 */
export async function updateSms(actor: Actor, raw: unknown) {
  const input = z.object({ phone: z.string().trim().max(20), consent: v.checkbox }).parse(raw);
  const phone = input.phone ? input.phone.replace(/[\s-]/g, "") : "";
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw invalid("phone_invalid", { field: "phone" });
  if (input.consent && !phone) throw invalid("phone_invalid", { field: "phone" });
  return withScope(actor.scope, async (tx) => {
    await tx.update(schema.users).set({ phoneE164: phone || null }).where(eq(schema.users.id, actor.user.id));
    await tx
      .update(schema.smsConsents)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.smsConsents.userId, actor.user.id), isNull(schema.smsConsents.revokedAt)));
    if (input.consent && phone) {
      await tx.insert(schema.smsConsents).values({ tenantId: actor.tenant.id, userId: actor.user.id, phoneE164: phone, source: "account_settings" });
    }
    await recordEvent(tx, actor, { type: input.consent ? "sms.consent_given" : "sms.consent_revoked", entityType: "user", entityId: actor.user.id });
  });
}
