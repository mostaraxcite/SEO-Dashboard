"use server";
import { revalidatePath } from "next/cache";
import { withActor, formObject, type ActionResult } from "@/server/action";
import * as requests from "@/server/services/requests";
import * as delivery from "@/server/services/delivery";
import { isFile } from "@/server/services/files";

const refresh = (slug: string) => revalidatePath(`/portal/${slug}`, "layout");

export async function submitRequestAction(slug: string, fd: FormData): Promise<ActionResult<{ ref: string }>> {
  const r = await withActor(slug, async (a) => {
    const f = formObject(fd);
    const answers = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith("answer_")).map(([k, v]) => [k.slice(7), String(v)]));
    // clientOrgId is never read from the form for clients — the service derives it from membership.
    const req = await requests.submitRequest(a, { ...f, clientOrgId: undefined, answers }, fd.getAll("files").filter((x): x is File => isFile(x)));
    return { ref: req.publicRef };
  });
  refresh(slug);
  return r;
}

export async function clientReplyAction(slug: string, id: string, body: string): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await requests.clientReply(a, id, body);
  });
  refresh(slug);
  return r;
}

export async function decideAction(slug: string, input: Record<string, unknown>): Promise<ActionResult> {
  const r = await withActor(slug, async (a) => {
    await delivery.decideApproval(a, input);
  });
  refresh(slug);
  return r;
}
