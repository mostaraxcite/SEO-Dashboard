import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Actor } from "./context";
import { schema } from "./db";
import { forbidden } from "./errors";

const { projects, tasks, requests } = schema;

export const isAdmin = (a: Actor) => a.role === "owner" || a.role === "admin";
export const isManager = (a: Actor) => isAdmin(a) || a.role === "manager";
export const isGuest = (a: Actor) => a.role === "guest";
export const isClient = (a: Actor) => a.role === "client";

export function assertStaff(a: Actor) {
  if (!a.isStaff) throw forbidden();
}
export function assertNotGuest(a: Actor) {
  if (!a.isStaff || isGuest(a)) throw forbidden();
}
export function assertManager(a: Actor) {
  if (!isManager(a)) throw forbidden();
}
export function assertAdmin(a: Actor) {
  if (!isAdmin(a)) throw forbidden();
}
export function assertRequestsMode(a: Actor) {
  if (a.tenant.mode !== "requests") throw forbidden("requests_disabled");
}

/** Projects the actor may see. Managers: all. Members: workspace projects + their own. Guests: explicit, unexpired membership. */
export function projectVisible(a: Actor): SQL | undefined {
  if (isManager(a)) return undefined;
  const member = sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${a.user.id} and (pm.expires_at is null or pm.expires_at > now()))`;
  if (isGuest(a)) return member;
  return sql`(${projects.access} = 'workspace' or ${projects.ownerId} = ${a.user.id} or ${member})`;
}

/** Tasks the actor may see. */
export function taskVisible(a: Actor): SQL | undefined {
  if (isManager(a)) return undefined;
  const inVisibleProject = sql`exists (select 1 from projects p where p.id = ${tasks.projectId} and ${projectVisibleAlias(a, "p")})`;
  if (isGuest(a)) return inVisibleProject;
  return sql`(${tasks.assigneeId} = ${a.user.id} or ${tasks.createdBy} = ${a.user.id} or ${inVisibleProject}
    or exists (select 1 from requests r where r.id = ${tasks.requestId} and r.owner_id = ${a.user.id}))`;
}

/** Requests a staff actor may see (clients are scoped by RLS + requester org). */
export function requestVisible(a: Actor): SQL | undefined {
  if (isManager(a)) return undefined;
  if (isGuest(a)) return sql`false`;
  return sql`(${requests.ownerId} = ${a.user.id}
    or exists (select 1 from tasks t where t.request_id = ${requests.id} and t.assignee_id = ${a.user.id})
    or exists (select 1 from projects p where p.id = ${requests.projectId} and ${projectVisibleAlias(a, "p")}))`;
}

function projectVisibleAlias(a: Actor, alias: string): SQL {
  const p = sql.raw(alias);
  const member = sql`exists (select 1 from project_members pm where pm.project_id = ${p}.id and pm.user_id = ${a.user.id} and (pm.expires_at is null or pm.expires_at > now()))`;
  if (isManager(a)) return sql`true`;
  if (isGuest(a)) return member;
  return sql`(${p}.access = 'workspace' or ${p}.owner_id = ${a.user.id} or ${member})`;
}
