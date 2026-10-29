"use server";
import { revalidatePath } from "next/cache";
import { withActor, formObject, type ActionResult } from "@/server/action";
import * as tasks from "@/server/services/tasks";
import * as projects from "@/server/services/projects";
import * as requests from "@/server/services/requests";
import * as delivery from "@/server/services/delivery";
import * as deps from "@/server/services/dependencies";
import * as ws from "@/server/services/workspace";
import { insertAttachments, isFile, prepareUploads } from "@/server/services/files";
import { withScope, schema } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { taskVisible } from "@/server/authz";
import { notFound } from "@/server/errors";
import { recordEvent } from "@/server/events";

const base = (slug: string) => `/w/${slug}`;
const refresh = (slug: string) => revalidatePath(base(slug), "layout");

// ─── Tasks ──────────────────────────────────────────────────────────────

export async function createTaskAction(slug: string, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const r = await withActor(slug, async (a) => ({ id: (await tasks.createTask(a, input)).id }));
  refresh(slug);
  return r;
}

export async function updateTaskAction(slug: string, id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await tasks.updateTask(a, id, patch);
  });
  refresh(slug);
  return r;
}

export async function deleteTaskAction(slug: string, id: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await tasks.deleteTask(a, id);
  });
  refresh(slug);
  return r;
}

export async function commentTaskAction(slug: string, id: string, body: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await tasks.addTaskComment(a, id, body);
  });
  refresh(slug);
  return r;
}

export async function uploadTaskFilesAction(slug: string, taskId: string, fd: FormData): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    const files = fd.getAll("files").filter((f): f is File => isFile(f));
    const prepared = await prepareUploads(a.tenant.id, files);
    await withScope(a.scope, async (tx) => {
      const [t] = await tx.select().from(schema.tasks).where(and(eq(schema.tasks.id, taskId), taskVisible(a)));
      if (!t) throw notFound();
      await insertAttachments(tx, a, prepared, { taskId, projectId: null, clientOrgId: t.clientOrgId, visibility: "internal" });
      for (const p of prepared) await recordEvent(tx, a, { type: "file.uploaded", entityType: "task", entityId: taskId, taskId, timeline: "internal", data: { filename: p.filename } });
    });
  });
  refresh(slug);
  return r;
}

// ─── Projects ───────────────────────────────────────────────────────────

export async function createProjectAction(slug: string, _: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await withActor(slug, async (a) => ({ id: (await projects.createProject(a, formObject(fd))).id }));
  refresh(slug);
  return r;
}

export async function updateProjectAction(slug: string, id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await projects.updateProject(a, id, patch);
  });
  refresh(slug);
  return r;
}

export async function addProjectMemberAction(slug: string, projectId: string, userId: string): Promise<ActionResult> {
  const r = await withActor(slug, (a) => projects.addProjectMember(a, projectId, userId));
  refresh(slug);
  return r;
}

// ─── Requests (staff) ───────────────────────────────────────────────────

export async function acceptRequestAction(slug: string, id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.acceptRequest(a, id, input);
  });
  refresh(slug);
  return r;
}
export async function requestInfoAction(slug: string, id: string, question: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.requestInfo(a, id, question);
  });
  refresh(slug);
  return r;
}
export async function declineRequestAction(slug: string, id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.declineRequest(a, id, input);
  });
  refresh(slug);
  return r;
}
export async function staffReplyAction(slug: string, id: string, body: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.staffReply(a, id, body);
  });
  refresh(slug);
  return r;
}
export async function requestNoteAction(slug: string, id: string, body: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.addRequestNote(a, id, body);
  });
  refresh(slug);
  return r;
}
export async function setRequestStatusAction(slug: string, id: string, to: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.setRequestStatus(a, id, to);
  });
  refresh(slug);
  return r;
}
export async function changeCommitmentAction(slug: string, id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.changeCommitment(a, id, input);
  });
  refresh(slug);
  return r;
}
export async function linkProjectAction(slug: string, id: string, projectId: string | null): Promise<ActionResult> {
  const r = await withActor(slug, (a) => requests.linkProject(a, id, projectId));
  refresh(slug);
  return r;
}
export async function closeRequestAction(slug: string, id: string): Promise<ActionResult> {
  const r = await withActor(slug, (a) => requests.closeRequest(a, id));
  refresh(slug);
  return r;
}
export async function reopenRequestAction(slug: string, id: string, reason: string): Promise<ActionResult> {
  const r = await withActor(slug, (a) => requests.reopenRequest(a, id, reason));
  refresh(slug);
  return r;
}
export async function deliverAction(slug: string, id: string, fd: FormData): Promise<ActionResult<{ version: number }>> {
  const r = await withActor(slug, async (a) => {
    const res = await delivery.deliverRequest(a, id, formObject(fd), fd.getAll("files").filter((f): f is File => isFile(f)));
    return { version: res.deliverable.version };
  });
  refresh(slug);
  return r;
}
export async function staffSubmitRequestAction(slug: string, fd: FormData): Promise<ActionResult<{ ref: string }>> {
  const r = await withActor(slug, async (a) => {
    const f = formObject(fd);
    const answers = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith("answer_")).map(([k, v]) => [k.slice(7), String(v)]));
    const req = await requests.submitRequest(a, { ...f, answers }, fd.getAll("files").filter((f): f is File => isFile(f)));
    return { ref: req.publicRef };
  });
  refresh(slug);
  return r;
}

// ─── Dependencies ───────────────────────────────────────────────────────

export async function createDependencyAction(slug: string, input: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await deps.createDependency(a, input);
  });
  refresh(slug);
  return r;
}
export async function resolveDependencyAction(slug: string, id: string): Promise<ActionResult> {
  const r = await withActor(slug, (a) => deps.resolveDependency(a, id));
  refresh(slug);
  return r;
}

// ─── Clients & members ──────────────────────────────────────────────────

export async function createClientAction(slug: string, _: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await withActor(slug, async (a) => ({ id: (await ws.createClient(a, formObject(fd))).id }));
  refresh(slug);
  return r;
}
export async function inviteAction(slug: string, _: unknown, fd: FormData): Promise<ActionResult<{ link: string }>> {
  const r = await withActor(slug, (a) => ws.createInvite(a, formObject(fd)));
  refresh(slug);
  return r;
}
