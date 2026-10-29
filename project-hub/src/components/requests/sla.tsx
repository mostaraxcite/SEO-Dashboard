import { Clock, TriangleAlert, CircleCheck, Pause } from "lucide-react";
import type { T } from "@/i18n";
import { Pill } from "@/components/ui/status";

/** SLA state as text + icon. Staff-only; never shown to requesters. */
export function SlaPill({ status, t, label }: { status: string | null; t: T; label?: string }) {
  if (!status) return null;
  const map = {
    on_track: { tone: "neutral" as const, icon: <Clock />, text: t("request.sla.onTrack") },
    running: { tone: "neutral" as const, icon: <Clock />, text: t("request.sla.onTrack") },
    at_risk: { tone: "warning" as const, icon: <TriangleAlert />, text: t("request.sla.atRisk") },
    breached: { tone: "danger" as const, icon: <TriangleAlert />, text: t("request.sla.breached") },
    met: { tone: "success" as const, icon: <CircleCheck />, text: t("request.sla.met") },
    paused: { tone: "neutral" as const, icon: <Pause />, text: t("request.sla.paused") },
  } as Record<string, { tone: "neutral" | "warning" | "danger" | "success"; icon: React.ReactNode; text: string }>;
  const m = map[status];
  if (!m) return null;
  return (
    <Pill tone={m.tone} icon={m.icon}>
      {label ? `${label}: ` : ""}
      {m.text}
    </Pill>
  );
}
