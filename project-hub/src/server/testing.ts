import "server-only";
import { sql } from "drizzle-orm";
import { systemDb, schema } from "./db";
import { loadActor } from "./context";

/** Builds an Actor for scripts/tests without an HTTP session. Never used by request handlers. */
export async function actorByEmail(email: string, slug: string) {
  const [u] = await systemDb().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
  if (!u) throw new Error(`no user ${email}`);
  const actor = await loadActor(
    { id: u.id, email: u.email, name: u.name, locale: u.locale === "ar" ? "ar" : "en", theme: "system", phoneE164: u.phoneE164 },
    slug,
  );
  if (!actor) throw new Error(`${email} is not a member of ${slug}`);
  return actor;
}
