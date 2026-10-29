import Link from "next/link";
import { Bell } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { listNotifications } from "@/server/services/notifications";
import { notificationText } from "@/server/notify/render";
import { formatRelative } from "@/i18n";
import { PageHeader, Panel, EmptyState } from "@/components/ui/misc";
import { MarkAllRead } from "./mark-all";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const items = await listNotifications(actor, 100);
  return (
    <>
      <PageHeader title={t("notifications.title")} actions={<MarkAllRead slug={slug} label={t("notifications.markAllRead")} />} />
      <Panel>
        {items.length === 0 ? (
          <EmptyState icon={<Bell />} title={t("notifications.empty")} />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex items-center gap-3 px-4 py-3 hover:bg-hover/60">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                  <span className={`min-w-0 flex-1 ${n.readAt ? "text-fg-2" : "text-fg"}`} dir="auto">{notificationText(t, n.type, n.params)}</span>
                  <span className="text-xs text-muted">{formatRelative(n.createdAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
