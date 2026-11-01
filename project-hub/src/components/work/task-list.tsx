"use client";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Ban, Check, GitBranch, MessageSquare } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Avatar, Ref } from "@/components/ui/misc";
import { Pill, taskStatusMeta } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { updateTaskAction } from "@/app/w/[slug]/actions";
import { DueLabel } from "./due";
import { cn } from "@/lib/cn";
import type { TaskStatus } from "@/server/db/schema";

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  assigneeName: string | null;
  projectName: string | null;
  requestRef: string | null;
  clientName: string | null;
  subtaskCount: number;
  subtaskDone: number;
  blocked: boolean;
  commentCount: number;
  teamLabel?: string | null;
};

export function TaskList({
  slug,
  tasks,
  today,
  showContext = true,
  empty,
  dense,
}: {
  slug: string;
  tasks: TaskItem[];
  today: string;
  showContext?: boolean;
  empty?: React.ReactNode;
  dense?: boolean;
}) {
  if (!tasks.length) return <>{empty ?? null}</>;
  return (
    <ul className="divide-y divide-line" role="list">
      {tasks.map((t) => (
        <TaskRow key={t.id} slug={slug} task={t} today={today} showContext={showContext} dense={dense} />
      ))}
    </ul>
  );
}

function TaskRow({ slug, task, today, showContext, dense }: { slug: string; task: TaskItem; today: string; showContext: boolean; dense?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [status, setStatus] = useOptimistic(task.status);
  const done = status === "done";
  const toggle = () =>
    start(async () => {
      const next = done ? "todo" : "done";
      setStatus(next);
      const r = await updateTaskAction(slug, task.id, { status: next });
      if (!r.ok) toast({ tone: "error", text: r.error });
    });
  const meta = taskStatusMeta[status];
  return (
    <li className={cn("group flex items-center gap-3 px-4 transition-colors hover:bg-hover", dense ? "py-1.5" : "py-2.5")}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={`${done ? t("task.reopen") : t("task.markDone")}: ${task.title}`}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
          done ? "border-success bg-success text-[color:var(--surface)]" : "border-line-strong hover:border-success",
        )}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <Link href={`/w/${slug}/tasks/${task.id}`} className={cn("block truncate text-fg hover:underline underline-offset-2", done && "text-muted line-through")}>
          {task.title}
        </Link>
        {showContext && (task.projectName || task.requestRef || task.clientName || task.teamLabel) ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
            {task.clientName ? <span className="font-medium text-fg-2">{task.clientName}</span> : null}
            {task.clientName && (task.projectName || task.requestRef) ? <span aria-hidden="true">·</span> : null}
            {task.projectName ? <span className="truncate">{task.projectName}</span> : null}
            {task.requestRef ? <Ref>{task.requestRef}</Ref> : null}
            {task.teamLabel ? <span className="truncate">· {task.teamLabel}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {task.blocked && !done ? (
          <Pill tone="danger" icon={<Ban />}>
            {t("home.blocked")}
          </Pill>
        ) : status !== "todo" && status !== "done" ? (
          <Pill tone={meta.tone} icon={meta.icon} className="hidden sm:inline-flex">
            {t(`task.status.${status}`)}
          </Pill>
        ) : null}
        {task.subtaskCount ? (
          <span className="tnum hidden items-center gap-1 text-xs text-muted sm:inline-flex" title={t("task.subtasks")}>
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            {task.subtaskDone}/{task.subtaskCount}
          </span>
        ) : null}
        {task.commentCount ? (
          <span className="tnum hidden items-center gap-1 text-xs text-muted md:inline-flex" title={t("task.comments")}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {task.commentCount}
          </span>
        ) : null}
        <DueLabel date={task.dueDate} today={today} done={done} />
        <span className="hidden w-6 sm:block" title={task.assigneeName ?? t("common.unassigned")}>
          {task.assigneeName ? <Avatar name={task.assigneeName} size={22} /> : <span className="block h-[22px] w-[22px] rounded-full border border-dashed border-line-strong" />}
        </span>
      </div>
    </li>
  );
}
