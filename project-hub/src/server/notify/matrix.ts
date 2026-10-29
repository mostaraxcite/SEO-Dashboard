/**
 * Default notification matrix (spec §8). Per audience, per channel.
 * `undefined` = channel never used for that event. Users can override within what's defined.
 * SMS is additionally gated by tenant settings, consent, quota, cooldown and quiet hours.
 */
export type Channel = "in_app" | "email" | "sms";
export type Mode = "immediate" | "digest" | "off";
type ChannelDefaults = Partial<Record<Channel, Mode>>;

export const DEFAULT_MATRIX: Record<string, { client?: ChannelDefaults; staff?: ChannelDefaults }> = {
  "request.submitted": { client: { in_app: "immediate", email: "immediate" }, staff: { in_app: "immediate", email: "off" } },
  "request.needs_info": { client: { in_app: "immediate", email: "immediate" } },
  "request.public_reply": { client: { in_app: "immediate", email: "immediate" } },
  "request.client_message": { staff: { in_app: "immediate", email: "off" } },
  "request.accepted": { client: { in_app: "immediate", email: "immediate" }, staff: { in_app: "immediate" } },
  "request.declined": { client: { in_app: "immediate", email: "immediate" } },
  "request.commitment_changed": { client: { in_app: "immediate", email: "immediate" }, staff: { in_app: "immediate" } },
  "request.delivered": { client: { in_app: "immediate", email: "immediate", sms: "off" }, staff: { in_app: "immediate" } },
  "request.reopened": { client: { in_app: "immediate", email: "immediate" }, staff: { in_app: "immediate" } },
  "approval.requested": { client: { in_app: "immediate", email: "immediate", sms: "off" } },
  "approval.approved": { client: { in_app: "immediate" }, staff: { in_app: "immediate" } },
  "approval.changes_requested": { client: { in_app: "immediate" }, staff: { in_app: "immediate", email: "immediate" } },
  "task.assigned": { staff: { in_app: "immediate", email: "digest" } },
  "dependency.assigned": { staff: { in_app: "immediate", email: "digest" } },
  "sla.warning": { staff: { in_app: "immediate", email: "digest" } },
  "sla.breached": { staff: { in_app: "immediate", email: "immediate" } },
};

export const PREFERENCE_EVENTS: { key: string; audience: "client" | "staff" }[] = [
  { key: "request.delivered", audience: "client" },
  { key: "approval.requested", audience: "client" },
  { key: "request.public_reply", audience: "client" },
  { key: "request.accepted", audience: "client" },
  { key: "request.commitment_changed", audience: "client" },
  { key: "task.assigned", audience: "staff" },
  { key: "request.submitted", audience: "staff" },
  { key: "request.client_message", audience: "staff" },
  { key: "approval.changes_requested", audience: "staff" },
  { key: "dependency.assigned", audience: "staff" },
  { key: "sla.warning", audience: "staff" },
  { key: "sla.breached", audience: "staff" },
];
