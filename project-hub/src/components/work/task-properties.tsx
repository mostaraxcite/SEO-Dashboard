"use client";
import { useState, useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { updateTaskAction } from "@/app/w/[slug]/actions";
import type { TaskStatus } from "@/server/db/schema";

/** Inline-editable task fields. Each change is a normal, authorized, audited update. */
export function TaskProperties({
  slug,
  task,
  people,
  projects,
}: {
  slug: string;
  task: { id: string; status: TaskStatus; assigneeId: string | null; dueDate: string | null; projectId: string | null; requestId: string | null; parentTaskId: string | null };
  people: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [, start] = useTransition();
  const save = (patch: Record<string, unknown>) =>
    start(async () => {
      const r = await updateTaskAction(slug, task.id, patch);
      if (!r.ok) toast({ tone: "error", text: r.error });
    });
  const row = "grid grid-cols-[minmax(6.5rem,35%)_1fr] items-center gap-3 py-1";
  return (
    <dl className="divide-y divide-line/0">
      <div className={row}>
        <dt className="text-sm text-muted">
          <label htmlFor="tp-status">{t("common.status")}</label>
        </dt>
        <dd>
          <Select id="tp-status" defaultValue={task.status} onChange={(e) => save({ status: e.target.value })} className="h-8 text-sm" quiet>
            {(["todo", "in_progress", "review", "done"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`task.status.${s}`)}
              </option>
            ))}
          </Select>
        </dd>
      </div>
      <div className={row}>
        <dt className="text-sm text-muted">
          <label htmlFor="tp-assignee">{t("task.assignee")}</label>
        </dt>
        <dd>
          <Select id="tp-assignee" defaultValue={task.assigneeId ?? ""} onChange={(e) => save({ assigneeId: e.target.value })} className="h-8 text-sm" quiet>
            <option value="">{t("common.unassigned")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </dd>
      </div>
      <div className={row}>
        <dt className="text-sm text-muted">
          <label htmlFor="tp-due">{t("task.dueDate")}</label>
        </dt>
        <dd>
          <Input id="tp-due" type="date" defaultValue={task.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value })} className="h-8 text-sm" quiet />
        </dd>
      </div>
      {!task.parentTaskId && !task.requestId ? (
        <div className={row}>
          <dt className="text-sm text-muted">
            <label htmlFor="tp-project">{t("common.project")}</label>
          </dt>
          <dd>
            <Select id="tp-project" defaultValue={task.projectId ?? ""} onChange={(e) => save({ projectId: e.target.value })} className="h-8 text-sm" quiet>
              <option value="">{t("task.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function EditableText({
  slug,
  taskId,
  field,
  value,
  placeholder,
  multiline,
  className,
  label,
}: {
  slug: string;
  taskId: string;
  field: "title" | "description";
  value: string;
  placeholder: string;
  multiline?: boolean;
  className?: string;
  label: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (v === value) return setEditing(false);
      const r = await updateTaskAction(slug, taskId, { [field]: v });
      if (r.ok) setEditing(false);
      else toast({ tone: "error", text: r.error });
    });
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className={`block w-full rounded-md text-start hover:bg-hover/70 ${className ?? ""}`} aria-label={`${t("common.edit")}: ${label}`}>
        {value ? (
          <span className="whitespace-pre-wrap" dir="auto">
            {value}
          </span>
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
      </button>
    );
  return (
    <div className="space-y-2">
      {multiline ? (
        <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={6} autoFocus aria-label={label} dir="auto" />
      ) : (
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          autoFocus
          aria-label={label}
          dir="auto"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-10 text-lg font-semibold"
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={save} loading={pending}>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setV(value);
            setEditing(false);
          }}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
