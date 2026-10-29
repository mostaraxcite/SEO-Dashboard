import { sql, eq } from "drizzle-orm";
import { systemDb, withScope, schema } from "@/server/db";
import { actorByEmail } from "@/server/testing";

export const as = actorByEmail;
export { systemDb, withScope, schema, sql, eq };

export async function requestByRef(ref: string, tenantSlug: string) {
  const [t] = await systemDb().select().from(schema.tenants).where(eq(schema.tenants.slug, tenantSlug));
  const [r] = await systemDb().select().from(schema.requests).where(sql`${schema.requests.publicRef} = ${ref} and ${schema.requests.tenantId} = ${t.id}`);
  return r;
}

export async function outbox(type: string, requestId?: string) {
  return systemDb()
    .select()
    .from(schema.outboxEvents)
    .where(requestId ? sql`${schema.outboxEvents.type} = ${type} and ${schema.outboxEvents.payload}->>'requestId' = ${requestId}` : eq(schema.outboxEvents.type, type));
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; key?: string; name?: string };
    if (err.code === code || err.key === code) return;
    if (code === "invalid" && err.name === "ZodError") return;
    throw new Error(`expected ${code}, got ${err.code}/${err.key}: ${(e as Error).message}`);
  }
  throw new Error(`expected ${code}, but it resolved`);
}
