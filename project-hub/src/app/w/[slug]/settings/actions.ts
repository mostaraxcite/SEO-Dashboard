"use server";
import { revalidatePath } from "next/cache";
import { withActor, type ActionResult } from "@/server/action";
import * as ws from "@/server/services/workspace";
import * as st from "@/server/services/settings";
import { insertAttachments, isFile, prepareUploads } from "@/server/services/files";
import { withScope } from "@/server/db";
import { assertAdmin } from "@/server/authz";
import { AppError } from "@/server/errors";

/** FormData → object, keeping repeated keys (checkbox groups) as arrays. */
function obj(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION") || typeof v !== "string") continue;
    out[k] = k in out ? ([] as unknown[]).concat(out[k], v) : v;
  }
  return out;
}

function done<T>(slug: string, r: ActionResult<T>): ActionResult<T> {
  revalidatePath(`/w/${slug}`, "layout");
  revalidatePath(`/portal/${slug}`, "layout");
  return r.ok ? { ...r, message: "saved" } : r;
}

export async function saveGeneral(slug: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => ws.updateGeneral(a, obj(fd))));
}
export async function saveBranding(slug: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => ws.updateBranding(a, obj(fd))));
}
export async function saveSla(slug: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => st.updateSla(a, obj(fd))));
}
export async function saveNotifications(slug: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => st.updateNotificationSettings(a, obj(fd))));
}
export async function saveAi(slug: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => st.updateAiSettings(a, obj(fd))));
}
export async function saveCategory(slug: string, id: string, _: unknown, fd: FormData) {
  return done(slug, await withActor(slug, (a) => ws.updateCategory(a, id, obj(fd))));
}
export async function setRoleAction(slug: string, userId: string, role: string) {
  return done(slug, await withActor(slug, (a) => ws.setMemberRole(a, userId, role)));
}

export async function uploadLogo(slug: string, _: unknown, fd: FormData) {
  return done(
    slug,
    await withActor(slug, async (a) => {
      assertAdmin(a);
      const file = fd.get("logo");
      if (!isFile(file)) throw new AppError("invalid", "file_type");
      if (file.size > 1024 * 1024) throw new AppError("invalid", "file_too_large");
      const prepared = await prepareUploads(a.tenant.id, [file]);
      if (!["image/png", "image/jpeg", "image/webp"].includes(prepared[0].mime)) throw new AppError("invalid", "file_type");
      const [att] = await withScope(a.scope, (tx) => insertAttachments(tx, a, prepared, { visibility: "internal" }));
      await ws.setLogo(a, att.id);
    }),
  );
}
export async function removeLogo(slug: string) {
  return done(slug, await withActor(slug, (a) => ws.setLogo(a, null)));
}
