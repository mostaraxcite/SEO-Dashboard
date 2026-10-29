"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toResult, formObject, type ActionResult } from "@/server/action";
import { destroySession, getSessionUser } from "@/server/auth/session";
import { acceptInvite, consumeMagicLink, loginWithPassword, requestMagicLink, safeNext, signup } from "@/server/services/auth";
import { listWorkspacesFor } from "@/server/context";
import { getLocale } from "@/server/i18n";
import { AppError } from "@/server/errors";

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

async function landingFor(userId: string, next: string | null) {
  if (next) return next;
  const ws = await listWorkspacesFor(userId);
  if (ws.length === 1) return ws[0].role === "client" ? `/portal/${ws[0].slug}` : `/w/${ws[0].slug}`;
  return "/workspaces";
}

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const f = formObject(fd);
  let target = "/workspaces";
  const r = await toResult(async () => {
    const user = await loginWithPassword({ email: f.email, password: f.password }, await clientIp());
    target = await landingFor(user.id, safeNext(f.next));
  });
  if (r.ok) redirect(target);
  return r;
}

export async function magicLinkAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const f = formObject(fd);
  const r = await toResult(async () => requestMagicLink(f.email, safeNext(f.next), await clientIp(), await getLocale()));
  return r.ok ? { ok: true, message: "sent" } : r;
}

export async function consumeMagicAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  let target: string;
  try {
    const next = await consumeMagicLink(token);
    const user = await getSessionUser();
    target = next === "/workspaces" && user ? await landingFor(user.id, null) : next;
  } catch (e) {
    if (e instanceof AppError) redirect("/auth/magic?invalid=1");
    throw e;
  }
  redirect(target);
}

export async function signupAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const f = formObject(fd);
  let slug = "";
  const r = await toResult(async () => {
    const tenant = await signup({ ...f, locale: await getLocale() }, await clientIp());
    slug = tenant.slug;
  });
  if (r.ok) redirect(`/w/${slug}`);
  return r;
}

export async function acceptInviteAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const f = formObject(fd);
  const token = String(f.token ?? "");
  let target = "/workspaces";
  const r = await toResult(async () => {
    const user = await getSessionUser();
    const res = await acceptInvite(token, user, { name: f.name, password: f.password });
    target = res.role === "client" ? `/portal/${res.slug}` : `/w/${res.slug}`;
  });
  if (r.ok) redirect(target);
  if (r.code === "unauthenticated") redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return r;
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
