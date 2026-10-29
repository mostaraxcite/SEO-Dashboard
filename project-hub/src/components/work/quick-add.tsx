"use client";
import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { createTaskAction } from "@/app/w/[slug]/actions";

/** Fast inline task creation. Enter to add; assignee/due optional. */
export function QuickAddTask({
  slug,
  projectId,
  requestId,
  parentTaskId,
  people,
  placeholder,
  defaultAssigneeId,
}: {
  slug: string;
  projectId?: string | null;
  requestId?: string | null;
  parentTaskId?: string | null;
  people: { id: string; name: string }[];
  placeholder?: string;
  defaultAssigneeId?: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    start(async () => {
      const r = await createTaskAction(slug, { title, projectId: projectId ?? null, requestId: requestId ?? null, parentTaskId: parentTaskId ?? null, assigneeId, dueDate });
      if (r.ok) {
        setTitle("");
        setDueDate("");
        ref.current?.focus();
      } else toast({ tone: "error", text: r.error });
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <label className="min-w-[12rem] flex-1">
        <span className="sr-only">{t("task.addTask")}</span>
        <input
          ref={ref}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder ?? t("task.titlePlaceholder")}
          maxLength={240}
          className="h-8 w-full bg-transparent text-fg placeholder:text-muted focus:outline-none"
        />
      </label>
      {title ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label={t("task.assignee")} className="h-8 w-40 text-sm">
            <option value="">{t("common.unassigned")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={t("task.dueDate")} className="h-8 w-36 text-sm" />
          <Button type="submit" variant="primary" size="sm" loading={pending}>
            {t("common.add")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
