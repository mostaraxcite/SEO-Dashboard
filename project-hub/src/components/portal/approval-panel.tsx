"use client";
import { useState, useTransition } from "react";
import { Check, PenLine } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { decideAction } from "@/app/portal/[slug]/actions";

/** Approve or request changes on one specific version (the server rejects stale versions). */
export function ApprovalPanel({ slug, approvalId, version, canApprove }: { slug: string; approvalId: string; version: number; canApprove: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (!canApprove) return null;
  const decide = (decision: "approved" | "changes_requested") =>
    start(async () => {
      const r = await decideAction(slug, { approvalId, version, decision, note });
      if (r.ok) toast({ tone: "success", text: decision === "approved" ? t("portal.approved") : t("portal.changesRequested") });
      else toast({ tone: "error", text: r.error });
    });
  return (
    <div className="space-y-3">
      {mode === "changes" ? (
        <div className="space-y-2">
          <label htmlFor="changes" className="text-sm font-medium">
            {t("portal.changesPlaceholder")}
          </label>
          <Textarea id="changes" value={note} onChange={(e) => setNote(e.target.value)} rows={3} dir="auto" autoFocus />
          <div className="flex gap-2">
            <Button variant="primary" loading={pending} disabled={!note.trim()} onClick={() => decide("changes_requested")}>
              {t("portal.requestChanges")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={pending} onClick={() => decide("approved")}>
            <Check className="h-4 w-4" /> {t("portal.approve")}
          </Button>
          <Button onClick={() => setMode("changes")}>
            <PenLine className="h-4 w-4" /> {t("portal.requestChanges")}
          </Button>
        </div>
      )}
    </div>
  );
}
