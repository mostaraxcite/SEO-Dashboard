"use server";
import { revalidatePath } from "next/cache";
import { withActor } from "@/server/action";
import { markRead, setPreference } from "@/server/services/notifications";

export async function markNotificationsRead(slug: string, id?: string) {
  await withActor(slug, async (a) => {
    await markRead(a, id);
  });
  revalidatePath(`/w/${slug}`, "layout");
  revalidatePath(`/portal/${slug}`, "layout");
}

export async function savePreference(slug: string, input: { event: string; channel: string; mode: string }) {
  const r = await withActor(slug, (a) => setPreference(a, input));
  revalidatePath(`/w/${slug}/account`);
  revalidatePath(`/portal/${slug}/account`);
  return r;
}
