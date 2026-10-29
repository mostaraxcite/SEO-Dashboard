"use client";
import { Thread, type ThreadItem } from "@/components/work/thread";
import { useI18n } from "@/components/i18n-provider";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { requestNoteAction, staffReplyAction } from "../../actions";

/** Public conversation and internal notes are different tables and different panels. */
export function StaffThreads({
  slug,
  requestId,
  tab,
  messages,
  notes,
  closed,
}: {
  slug: string;
  requestId: string;
  tab: "conversation" | "work";
  messages: ThreadItem[];
  notes: ThreadItem[];
  closed: boolean;
}) {
  const { t } = useI18n();
  if (tab === "conversation")
    return (
      <Panel>
        <PanelHeader title={t("request.conversation")} description={t("request.publicNote")} />
        <Thread
          items={messages}
          mode="public"
          anchorPrefix="msg"
          placeholder={t("request.replyPlaceholder")}
          submitLabel={t("request.reply")}
          onSubmit={closed ? undefined : (body) => staffReplyAction(slug, requestId, body)}
          emptyText="—"
        />
      </Panel>
    );
  return (
    <Panel>
      <PanelHeader title={t("request.internalNote")} description={t("task.internalOnly")} />
      <Thread items={notes} mode="internal" anchorPrefix="note" placeholder={t("task.commentPlaceholder")} submitLabel={t("task.comment")} onSubmit={(body) => requestNoteAction(slug, requestId, body)} />
    </Panel>
  );
}
