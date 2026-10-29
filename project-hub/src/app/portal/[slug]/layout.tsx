import { requireClient } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/ui/toast";
import { BrandStyle } from "@/components/shell/brand-style";
import { PortalShell } from "@/components/portal/portal-shell";
import { listNotifications, unreadCount } from "@/server/services/notifications";
import { listPendingApprovals } from "@/server/services/delivery";
import { notificationText } from "@/server/notify/render";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireClient(slug);
  const { t, locale } = await getI18n();
  const [unread, items, approvals] = await Promise.all([unreadCount(actor), listNotifications(actor, 8), actor.tenant.mode === "requests" ? listPendingApprovals(actor) : []]);
  const bell = items.map((n) => ({ id: n.id, text: notificationText(t, n.type, n.params), href: n.href, createdAt: n.createdAt.toISOString(), read: !!n.readAt }));
  return (
    <I18nProvider locale={locale} timeZone={actor.tenant.timezone}>
      <Toaster>
        <BrandStyle color={actor.tenant.theme.brandColor} />
        <PortalShell actor={actor} t={t} approvals={actor.canApprove ? approvals.length : 0} bell={bell} unread={unread}>
          {children}
        </PortalShell>
      </Toaster>
    </I18nProvider>
  );
}
