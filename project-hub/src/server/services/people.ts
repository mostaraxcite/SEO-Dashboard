import "server-only";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { withScope, schema, type Tx } from "../db";
import type { Actor } from "../context";
import { invalid } from "../errors";

export type Person = { id: string; name: string; email: string; role: string; title: string | null };

/** Staff (non-client) members of the active tenant. */
export async function listStaff(actor: Actor): Promise<Person[]> {
  if (!actor.isStaff) return [];
  return withScope(actor.scope, (tx) =>
    tx
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role, title: schema.memberships.title })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(ne(schema.memberships.role, "client"), isNull(schema.memberships.disabledAt)))
      .orderBy(asc(schema.users.name)),
  );
}

/** Throws unless every id is an active staff member of the actor's tenant. */
export async function assertStaffUsers(tx: Tx, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter(Boolean) as string[])];
  if (!wanted.length) return;
  const rows = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(inArray(schema.memberships.userId, wanted), ne(schema.memberships.role, "client"), isNull(schema.memberships.disabledAt)));
  if (rows.length !== wanted.length) throw invalid("invalid", { field: "assignee" });
}

export async function userNames(tx: Tx, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter(Boolean) as string[])];
  if (!wanted.length) return new Map<string, string>();
  const rows = await tx.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}
