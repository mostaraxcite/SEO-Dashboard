"use server";
import { revalidatePath } from "next/cache";
import { withActor, type ActionResult } from "@/server/action";
import { applySuggestedTasks, resolveDraft, runAi, saveSummaryAsNote, type AiRunResult, type AiTarget } from "@/server/ai/service";
import type { Feature } from "@/server/ai/schemas";

/** Explicit-click AI actions. Drafts only; nothing is changed without a second confirmation. */
export async function runAiAction<F extends Feature>(slug: string, feature: F, target: AiTarget): Promise<ActionResult<AiRunResult<F>>> {
  return withActor(slug, (a) => runAi(a, feature, target));
}

export async function dismissDraftAction(slug: string, draftId: string, applied = false): Promise<ActionResult> {
  return withActor(slug, (a) => resolveDraft(a, draftId, applied ? "applied" : "discarded"));
}

export async function applyTasksAction(slug: string, input: { draftId: string; tasks: Record<string, unknown>[] }): Promise<ActionResult<{ count: number }>> {
  const r = await withActor(slug, async (a) => ({ count: (await applySuggestedTasks(a, input)).length }));
  revalidatePath(`/w/${slug}`, "layout");
  return r;
}

export async function saveSummaryAction(slug: string, draftId: string, body: string): Promise<ActionResult> {
  const r = await withActor(slug, (a) => saveSummaryAsNote(a, { draftId, body }));
  revalidatePath(`/w/${slug}`, "layout");
  return r;
}
