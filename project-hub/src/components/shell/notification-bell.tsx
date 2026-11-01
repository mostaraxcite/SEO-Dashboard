"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { useI18n } from "@/components/i18n-provider";
import { formatRelative } from "@/i18n";
import { cn } from "@/lib/cn";
import { markNotificationsRead } from "@/app/notification-actions";

export type BellItem = { id: string; text: string; href: string; createdAt: string; read: boolean };

export function NotificationBell({ slug, items, unread, allHref, onSpine }: { slug: string; items: BellItem[]; unread: number; allHref: string; onSpine?: boolean }) {
  const { t, locale } = useI18n();
  const [pending, start] = useTransition();
  return (
    <Popover>
      <PopoverTrigger
        className={`tap relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${onSpine ? "text-spine-muted hover:bg-spine-hover hover:text-on-spine data-[state=open]:bg-spine-active" : "text-fg-2 hover:bg-hover hover:text-fg data-[state=open]:bg-hover"}`}
        aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}
      >
        <Bell className="h-[18px] w-[18px] stroke-[1.75]" />
        {unread ? <span className={`absolute top-1.5 end-1.5 h-2 w-2 rounded-full ${onSpine ? "bg-spine-mark ring-2 ring-[color:var(--spine)]" : "bg-accent ring-2 ring-[color:var(--canvas)]"}`} /> : null}
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <span className="font-medium">{t("notifications.title")}</span>
          {unread ? (
            <button className="text-sm text-accent hover:underline disabled:opacity-50" disabled={pending} onClick={() => start(() => markNotificationsRead(slug))}>
              {t("notifications.markAllRead")}
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-muted">{t("notifications.empty")}</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href} onClick={() => !n.read && start(() => markNotificationsRead(slug, n.id))} className="flex gap-2.5 px-3.5 py-2.5 hover:bg-hover">
                  <span aria-hidden="true" className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read ? "text-fg-2" : "text-fg")}>{n.text}</span>
                    <span className="block text-xs text-muted" suppressHydrationWarning>{formatRelative(n.createdAt, locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line px-3.5 py-2">
          <Link href={allHref} className="text-sm text-fg-2 hover:text-fg">
            {t("common.viewAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
