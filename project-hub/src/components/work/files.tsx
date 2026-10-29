"use client";
import { useRef, useTransition } from "react";
import { FileText, Paperclip, Upload } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action";

export type FileItem = { id: string; filename: string; size: number; url: string; mime: string };

export function formatSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** File list with signed, short-lived links; download re-checks permissions server-side. */
export function FileList({ files, empty }: { files: FileItem[]; empty?: string }) {
  if (!files.length) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.id}>
          <a href={f.url} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover" download>
            <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-fg group-hover:underline" dir="auto">
              {f.filename}
            </span>
            <span className="tnum text-xs text-muted">{formatSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function FileUpload({ onUpload, label }: { onUpload: (fd: FormData) => Promise<ActionResult>; label?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-sm text-fg-2 hover:border-[color:var(--text-muted)] hover:text-fg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
      {pending ? <Upload className="h-4 w-4 animate-pulse" /> : <Paperclip className="h-4 w-4" />}
      {pending ? t("common.saving") : (label ?? t("task.files"))}
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.mp4,.zip"
        onChange={(e) => {
          const files = e.target.files;
          if (!files?.length) return;
          const fd = new FormData();
          for (const f of files) fd.append("files", f);
          start(async () => {
            const r = await onUpload(fd);
            if (!r.ok) toast({ tone: "error", text: r.error });
            if (input.current) input.current.value = "";
          });
        }}
      />
    </label>
  );
}
