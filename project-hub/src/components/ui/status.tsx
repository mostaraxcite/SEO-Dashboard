import { Circle, CircleDashed, CircleDot, CircleCheck, CircleAlert, CircleX, Clock, Hourglass, PackageCheck, Archive, Pause, CirclePlay, Eye, Inbox, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand" | "accent";

/*
 * Calm states are outlined labels with a colored icon; only states that need action
 * (warning, danger) get a filled background. Status is always icon + text, never color alone.
 */
const tones: Record<Tone, string> = {
  neutral: "border border-line bg-surface text-fg-2",
  info: "border border-line bg-surface text-fg-2",
  success: "border border-line bg-surface text-fg-2",
  brand: "border border-line bg-surface text-fg",
  accent: "border border-line bg-surface text-fg-2",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
const iconTones: Record<Tone, string> = {
  neutral: "text-muted",
  info: "text-info",
  success: "text-success",
  brand: "text-fg",
  accent: "text-accent",
  warning: "",
  danger: "",
};

export function Pill({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] max-w-full items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {icon ? <span className={cn("shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", iconTones[tone])} aria-hidden="true">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export const taskStatusMeta = {
  todo: { tone: "neutral" as Tone, icon: <Circle /> },
  in_progress: { tone: "info" as Tone, icon: <CircleDot /> },
  review: { tone: "accent" as Tone, icon: <Eye /> },
  done: { tone: "success" as Tone, icon: <CircleCheck /> },
};

export const requestStatusMeta: Record<string, { tone: Tone; icon: React.ReactNode }> = {
  new: { tone: "accent", icon: <Inbox /> },
  triage: { tone: "accent", icon: <CircleDashed /> },
  needs_info: { tone: "warning", icon: <MessageCircleQuestion /> },
  accepted: { tone: "info", icon: <CircleCheck /> },
  declined: { tone: "neutral", icon: <CircleX /> },
  in_progress: { tone: "info", icon: <CircleDot /> },
  in_review: { tone: "accent", icon: <Eye /> },
  ready_to_deliver: { tone: "brand", icon: <PackageCheck /> },
  delivered: { tone: "success", icon: <PackageCheck /> },
  closed: { tone: "neutral", icon: <Archive /> },
};

export const publicStatusMeta: Record<string, { tone: Tone; icon: React.ReactNode }> = {
  received: { tone: "neutral", icon: <Inbox /> },
  under_review: { tone: "accent", icon: <Hourglass /> },
  in_progress: { tone: "info", icon: <CircleDot /> },
  waiting_on_you: { tone: "warning", icon: <CircleAlert /> },
  delivered: { tone: "success", icon: <PackageCheck /> },
  closed: { tone: "neutral", icon: <Archive /> },
  declined: { tone: "neutral", icon: <CircleX /> },
};

export const projectStatusMeta: Record<string, { tone: Tone; icon: React.ReactNode }> = {
  planned: { tone: "neutral", icon: <Clock /> },
  active: { tone: "info", icon: <CirclePlay /> },
  on_hold: { tone: "warning", icon: <Pause /> },
  completed: { tone: "success", icon: <CircleCheck /> },
  archived: { tone: "neutral", icon: <Archive /> },
};
