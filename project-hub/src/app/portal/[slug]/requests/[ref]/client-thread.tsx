"use client";
import { Thread, type ThreadItem } from "@/components/work/thread";
import { useI18n } from "@/components/i18n-provider";
import { clientReplyAction } from "../../actions";

export function ClientThread({ slug, requestId, items, closed, answering }: { slug: string; requestId: string; items: ThreadItem[]; closed: boolean; answering: boolean }) {
  const { t } = useI18n();
  return (
    <Thread
      items={items}
      mode="public"
      visibilityLabel={t("portal.sharedWithTeam")}
      anchorPrefix="msg"
      placeholder={answering ? t("portal.answerPlaceholder") : t("portal.messagePlaceholder")}
      submitLabel={answering ? t("portal.answerQuestion") : t("portal.sendMessage")}
      onSubmit={closed ? undefined : (body) => clientReplyAction(slug, requestId, body)}
    />
  );
}
