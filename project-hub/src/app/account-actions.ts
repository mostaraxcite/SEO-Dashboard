"use server";
import { revalidatePath } from "next/cache";
import { withActor, formObject, type ActionResult } from "@/server/action";
import { updateProfile, updateSms } from "@/server/services/account";

export async function profileAction(slug: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const r = await withActor(slug, (a) => updateProfile(a, formObject(fd)));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: "saved" } : r;
}

export async function smsAction(slug: string, _: unknown, fd: FormData): Promise<ActionResult> {
  const r = await withActor(slug, (a) => updateSms(a, formObject(fd)));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: "saved" } : r;
}
