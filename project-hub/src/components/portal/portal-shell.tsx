import Link from "next/link";
import { Plus } from "lucide-react";
import type { Actor } from "@/server/context";
import type { T } from "@/i18n";
import { NavLink } from "@/components/shell/nav-link";
import { UserMenu } from "@/components/shell/user-menu";
import { NotificationBell, type BellItem } from "@/components/shell/notification-bell";
import { WorkspaceMark } from "@/components/shell/brand-style";
import { buttonClass } from "@/components/ui/button";

/** Requester portal: top navigation only, one primary action, no internal concepts. */
export function PortalShell({ actor, t, approvals, bell, unread, children }: { actor: Actor; t: T; approvals: number; bell: BellItem[]; unread: number; children: React.ReactNode }) {
  const base = `/portal/${actor.tenant.slug}`;
  const name = actor.tenant.theme.displayName || actor.tenant.name;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t("app.skipToContent")}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href={base} className="flex min-w-0 items-center gap-2">
            <WorkspaceMark name={name} size={28} logoSrc={actor.tenant.theme.logoFileId ? `/api/logo/${actor.tenant.slug}?v=${actor.tenant.theme.logoFileId}` : null} />
            <span className="min-w-0">
              <span className="block truncate font-semibold leading-5">{name}</span>
              {actor.clientOrgName ? <span className="block truncate text-xs text-muted">{actor.clientOrgName}</span> : null}
            </span>
          </Link>
          <nav aria-label={t("common.menu")} className="ms-4 hidden items-center gap-1 md:flex">
            <NavLink href={base} exact variant="top" icon={null} label={t("nav.home")} />
            <NavLink href={`${base}/requests`} variant="top" icon={null} label={t("nav.myRequests")} />
            {approvals ? <NavLink href={`${base}/approvals`} variant="top" icon={null} label={t("nav.approvals")} badge={approvals} /> : null}
          </nav>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="hidden sm:block">
              <Link href={`${base}/new`} className={buttonClass("primary", "sm")}>
                <Plus className="h-4 w-4" /> {t("nav.newRequest")}
              </Link>
            </span>
            <NotificationBell slug={actor.tenant.slug} items={bell} unread={unread} allHref={`${base}/requests`} />
            <UserMenu name={actor.user.name} email={actor.user.email} theme={actor.user.theme} accountHref={`${base}/account`} compact />
          </div>
        </div>
        <nav aria-label={t("common.menu")} className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
          <NavLink href={base} exact variant="top" icon={null} label={t("nav.home")} />
          <NavLink href={`${base}/requests`} variant="top" icon={null} label={t("nav.myRequests")} />
          {approvals ? <NavLink href={`${base}/approvals`} variant="top" icon={null} label={t("nav.approvals")} badge={approvals} /> : null}
          <NavLink href={`${base}/new`} variant="top" icon={<Plus />} label={t("nav.newRequest")} />
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
