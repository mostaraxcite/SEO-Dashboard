import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { actorFor, type Actor } from "./context";
import { getI18n } from "./i18n";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

/** Maps domain/validation errors to a localized, user-safe result. Unexpected errors are logged, never leaked. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  const { t } = await getI18n();
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, code: e.code, error: t.dyn(`errors.${e.key}`, undefined, t.dyn(`errors.${e.code}`)) };
    }
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".");
        if (!fieldErrors[k]) fieldErrors[k] = issue.message.startsWith("errors.") ? t.dyn(issue.message) : t("errors.invalid");
      }
      return { ok: false, code: "invalid", error: t("errors.invalid"), fieldErrors };
    }
    if (isNextControlFlow(e)) throw e;
    console.error("[action] unexpected error", e);
    return { ok: false, code: "unavailable", error: t("common.somethingWrong") };
  }
}

export async function withActor<T>(slug: string, fn: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  return toResult(async () => fn(await actorFor(slug)));
}

function isNextControlFlow(e: unknown) {
  const d = (e as { digest?: string })?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_NOT_FOUND") || d.startsWith("NEXT_HTTP_ERROR"));
}

/** Converts FormData into a plain object (repeated keys become arrays). */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}
