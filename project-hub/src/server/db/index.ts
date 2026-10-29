import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "../env";

type Db = ReturnType<typeof drizzle<typeof schema>>;
const g = globalThis as unknown as { __phApp?: Db; __phOwner?: Db; __phAppSql?: postgres.Sql; __phOwnerSql?: postgres.Sql };

function client(url: string) {
  return postgres(url, { max: 10, idle_timeout: 20, onnotice: () => {} });
}

/** RLS-enforced connection. Only use through `withScope`. */
function appDb(): Db {
  if (!g.__phApp) {
    g.__phAppSql = client(env.databaseUrl);
    g.__phApp = drizzle(g.__phAppSql, { schema });
  }
  return g.__phApp;
}

/**
 * Owner connection (bypasses RLS). Restricted to: authentication bootstrap, workspace
 * resolution, the outbox worker, and seeds. Never pass user-controlled tenant ids here
 * without first verifying membership.
 */
export function systemDb(): Db {
  if (!g.__phOwner) {
    g.__phOwnerSql = client(env.databaseOwnerUrl);
    g.__phOwner = drizzle(g.__phOwnerSql, { schema });
  }
  return g.__phOwner;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DbScope = { tenantId: string; userId: string; clientOrgId: string | null };

/** Runs `fn` in a transaction with the RLS context set for this actor. */
export async function withScope<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return appDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', ${scope.userId}, true), set_config('app.client_org_id', ${scope.clientOrgId ?? ""}, true)`,
    );
    return fn(tx);
  });
}

export async function closeDb() {
  await g.__phAppSql?.end();
  await g.__phOwnerSql?.end();
  g.__phApp = g.__phOwner = g.__phAppSql = g.__phOwnerSql = undefined;
}

export { schema };
