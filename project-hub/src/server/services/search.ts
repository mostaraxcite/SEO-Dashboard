import "server-only";
import { and, desc, ilike, or } from "drizzle-orm";
import { withScope, schema } from "../db";
import type { Actor } from "../context";
import { projectVisible, requestVisible, taskVisible } from "../authz";
import { escapeLike } from "./requests";

/**
 * Basic search across what the actor can see: the same visibility predicates as lists,
 * under RLS. Internal comments are not searched (keeps results predictable and safe).
 */
export async function search(actor: Actor, q: string) {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return { requests: [], projects: [], tasks: [] };
  const like = `%${escapeLike(term)}%`;
  return withScope(actor.scope, async (tx) => {
    const requests =
      actor.tenant.mode === "requests"
        ? await tx
            .select({ ref: schema.requests.publicRef, title: schema.requests.title, status: schema.requests.status })
            .from(schema.requests)
            .where(and(actor.isStaff ? requestVisible(actor) : undefined, or(ilike(schema.requests.title, like), ilike(schema.requests.publicRef, like), ilike(schema.requests.objective, like))))
            .orderBy(desc(schema.requests.updatedAt))
            .limit(20)
        : [];
    if (!actor.isStaff) return { requests, projects: [], tasks: [] };
    const projects = await tx
      .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
      .from(schema.projects)
      .where(and(projectVisible(actor), ilike(schema.projects.name, like)))
      .limit(20);
    const tasks = await tx
      .select({ id: schema.tasks.id, title: schema.tasks.title, status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(taskVisible(actor), or(ilike(schema.tasks.title, like), ilike(schema.tasks.description, like))))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(30);
    return { requests, projects, tasks };
  });
}
