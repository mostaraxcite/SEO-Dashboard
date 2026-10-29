/**
 * Local development bootstrap: creates the owner + app roles and the database.
 * Uses DATABASE_ADMIN_URL (a superuser). Never run against production — provision
 * roles there through your infrastructure tooling with the same privileges.
 */
import postgres from "postgres";
import { loadEnv } from "./env";

loadEnv();
const reset = process.argv.includes("--reset");

function parse(url: string) {
  const u = new URL(url);
  return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), db: u.pathname.slice(1) };
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is required for db:setup");
  if (process.env.NODE_ENV === "production") throw new Error("db:setup is for local development only");
  const owner = parse(process.env.DATABASE_OWNER_URL!);
  const app = parse(process.env.DATABASE_URL!);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

  if (reset) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${ident(owner.db)} WITH (FORCE)`);
  }
  for (const r of [owner, app]) {
    const exists = await admin`select 1 from pg_roles where rolname = ${r.user}`;
    if (!exists.length) await admin.unsafe(`CREATE ROLE ${ident(r.user)} LOGIN PASSWORD ${lit(r.password)}`);
    else await admin.unsafe(`ALTER ROLE ${ident(r.user)} LOGIN PASSWORD ${lit(r.password)}`);
  }
  // The app role must never bypass RLS.
  await admin.unsafe(`ALTER ROLE ${ident(app.user)} NOSUPERUSER NOBYPASSRLS`);
  const db = await admin`select 1 from pg_database where datname = ${owner.db}`;
  if (!db.length) await admin.unsafe(`CREATE DATABASE ${ident(owner.db)} OWNER ${ident(owner.user)}`);
  await admin.end();

  const inDb = postgres(adminUrl.replace(/\/[^/?]*(\?|$)/, `/${owner.db}$1`), { max: 1, onnotice: () => {} });
  await inDb.unsafe(`GRANT CONNECT ON DATABASE ${ident(owner.db)} TO ${ident(app.user)}`);
  await inDb.unsafe(`ALTER SCHEMA public OWNER TO ${ident(owner.user)}`);
  await inDb.end();
  console.log(`Database ${owner.db} ready (owner=${owner.user}, app=${app.user})${reset ? " [reset]" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
