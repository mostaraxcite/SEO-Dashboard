import "server-only";
import { createHash } from "node:crypto";

/**
 * The only shape that ever reaches a model. It is built from data the invoking
 * actor can already read (same services/RLS as the UI). `items` carry stable
 * source ids so outputs can cite them and the server can drop invented ids.
 */
export type ContextItem = { id: string; kind: string; author: string | null; at: string; text: string; flag?: "overdue" | "open" | "done" | null };
export type AiContext = {
  resourceType: "request" | "task" | "brief";
  resourceId: string | null;
  revision: string;
  locale: "en" | "ar";
  audience: "staff" | "client";
  facts: Record<string, string | number | boolean | null | string[]>;
  items: ContextItem[];
  categories?: { key: string; label: string }[];
};

const MAX_ITEMS = 40;
const MAX_TEXT = 1500;

export function clip(text: string, max = MAX_TEXT) {
  const t = text.replace(/\s+\n/g, "\n").trim();
  return t.length > max ? t.slice(0, max) + " …" : t;
}

/** Keep the most recent items; minimizes what is sent and bounds cost. */
export function boundItems(items: ContextItem[]) {
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  return sorted.slice(-MAX_ITEMS).map((i) => ({ ...i, text: clip(i.text) }));
}

export function digest(parts: unknown) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function sourceIds(ctx: AiContext) {
  return new Set([...ctx.items.map((i) => i.id), `${ctx.resourceType}:${ctx.resourceId}`]);
}

export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
