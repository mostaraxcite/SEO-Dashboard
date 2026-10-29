"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Avatar } from "@/components/ui/misc";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DueLabel } from "@/components/work/due";
import { updateTaskAction } from "@/app/w/[slug]/actions";
import type { TaskItem } from "@/components/work/task-list";

const COLS = ["todo", "in_progress", "review", "done"] as const;

/** Optional board view. Moving a card is a select (keyboard and screen-reader friendly), not drag-only. */
export function Board({ slug, tasks, today }: { slug: string; tasks: TaskItem[]; today: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [, start] = useTransition();
  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-4">
      {COLS.map((c) => {
        const items = tasks.filter((x) => x.status === c);
        return (
          <section key={c} className="min-w-0 rounded-lg bg-sunken p-2" aria-label={t(`task.status.${c}`)}>
            <h3 className="flex items-center justify-between px-1.5 pb-2 text-sm font-medium">
              {t(`task.status.${c}`)} <span className="tnum text-xs text-muted">{items.length}</span>
            </h3>
            <ul className="space-y-2">
              {items.map((task) => (
                <li key={task.id} className="rounded-md border border-line bg-surface p-2.5 shadow-sm">
                  <Link href={`/w/${slug}/tasks/${task.id}`} className="block text-sm font-medium hover:underline" dir="auto">
                    {task.title}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <DueLabel date={task.dueDate} today={today} done={task.status === "done"} />
                    {task.assigneeName ? <Avatar name={task.assigneeName} size={20} /> : null}
                  </div>
                  <Select
                    aria-label={`${t("common.status")}: ${task.title}`}
                    defaultValue={task.status}
                    className="mt-2 h-7 text-xs"
                    onChange={(e) =>
                      start(async () => {
                        const r = await updateTaskAction(slug, task.id, { status: e.target.value });
                        if (!r.ok) toast({ tone: "error", text: r.error });
                      })
                    }
                  >
                    {COLS.map((s) => (
                      <option key={s} value={s}>
                        {t(`task.status.${s}`)}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
