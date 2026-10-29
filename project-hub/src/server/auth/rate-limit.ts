import "server-only";
import { sql } from "drizzle-orm";
import { systemDb } from "../db";
import { AppError } from "../errors";

/** Fixed-window limiter backed by Postgres (works across instances). */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await systemDb().execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart.toISOString()}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  if (Number(rows[0]?.count ?? 0) > limit) throw new AppError("rate_limited", "rate_limited");
}
