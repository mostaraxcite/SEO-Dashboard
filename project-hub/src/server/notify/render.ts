import type { T } from "@/i18n";

/** Renders a stored notification (type + params) in the viewer's language. */
export function notificationText(t: T, type: string, params: Record<string, string | null>) {
  const vars = { ...params, metric: params.metric ? t.dyn(`request.sla.${params.metric === "triage" ? "triage" : "firstResponse"}`) : "" };
  return t.dyn(`notifications.types.${type}`, vars, type);
}
