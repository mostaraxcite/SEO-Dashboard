import Link from "next/link";
import { BarChart3, Building2, FolderKanban, Inbox, Search, Settings, SquareCheckBig, Users } from "lucide-react";
import type { Actor } from "@/server/context";
import type { T } from "@/i18n";
import { isAdmin, isManager } from "@/server/authz";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";
import { NotificationBell, type BellItem } from "./notification-bell";
import { MobileNav } from "./mobile-nav";
import { WorkspaceMark } from "./brand-style";

export function StaffShell({
  actor,
  t,
  triageCount,
  bell,
  unread,
  children,
}: {
  actor: Actor;
  t: T;
  triageCount: number;
  bell: BellItem[];
  unread: number;
  children: React.ReactNode;
}) {
  const base = `/w/${actor.tenant.slug}`;
  const requestsMode = actor.tenant.mode === "requests";
  const internal = actor.tenant.kind === "internal";
  const items = [
    requestsMode && isManager(actor) ? { href: `${base}/inbox`, icon: <Inbox />, label: t("nav.inbox"), badge: triageCount } : null,
    { href: base, icon: <SquareCheckBig />, label: t("nav.myWork"), exact: true },
    { href: `${base}/projects`, icon: <FolderKanban />, label: t("nav.projects") },
    requestsMode && actor.role !== "guest" ? { href: `${base}/clients`, icon: internal ? <Building2 /> : <Users />, label: internal ? t("nav.departments") : t("nav.clients") } : null,
    isManager(actor) ? { href: `${base}/reports`, icon: <BarChart3 />, label: t("nav.reports") } : null,
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string; badge?: number; exact?: boolean }[];
  const name = actor.tenant.theme.displayName || actor.tenant.name;

  const logo = actor.tenant.theme.logoFileId ? `/api/logo/${actor.tenant.slug}?v=${actor.tenant.theme.logoFileId}` : null;

  // The workspace spine: everything that orients you (who, where, what) lives on one colored rail.
  const sidebar = (
    <div className="flex h-full flex-col px-3 pb-3 pt-4">
      <div className="mb-4 flex items-center gap-1">
        <Link href="/workspaces" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 hover:bg-spine-hover" title={t("nav.switchWorkspace")}>
          <WorkspaceMark name={name} logoSrc={logo} onSpine />
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-5 text-on-spine">{name}</span>
            <span className="block truncate text-xs text-spine-muted">{t(`settings.roles.${actor.role}` as never)}</span>
          </span>
        </Link>
        <NotificationBell slug={actor.tenant.slug} items={bell} unread={unread} allHref={`${base}/notifications`} onSpine />
      </div>
      <form action={`${base}/search`} role="search" className="mb-3">
        <label className="relative block">
          <span className="sr-only">{t("common.search")}</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-spine-muted" />
          <input
            name="q"
            type="search"
            placeholder={t("nav.search")}
            className="tap h-9 w-full rounded-md border border-spine-line bg-spine-hover ps-8 pe-3 text-sm text-on-spine placeholder:text-spine-muted focus-visible:border-spine-mark focus-visible:outline-none"
          />
        </label>
      </form>
      <nav aria-label={t("common.menu")} className="flex flex-col gap-0.5">
        {items.map((i) => (
          <NavLink key={i.href} {...i} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {isAdmin(actor) ? <NavLink href={`${base}/settings`} icon={<Settings />} label={t("nav.settings")} /> : null}
        {actor.tenant.isDemo ? <p className="mx-1 my-2 rounded-md border border-dashed border-spine-line px-2.5 py-1.5 text-xs text-spine-muted">{t("common.demoData")}</p> : null}
        <div className="border-t border-spine-line pt-2">
          <UserMenu name={actor.user.name} email={actor.user.email} theme={actor.user.theme} accountHref={`${base}/account`} onSpine />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        {t("app.skipToContent")}
      </a>
      <aside className="sticky top-0 hidden h-dvh bg-spine lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-spine px-2 text-on-spine lg:hidden">
          <MobileNav>{sidebar}</MobileNav>
          <Link href={base} className="flex min-w-0 items-center gap-2">
            <WorkspaceMark name={name} size={26} logoSrc={logo} onSpine />
            <span className="truncate font-semibold">{name}</span>
          </Link>
          <div className="ms-auto flex items-center">
            <Link href={`${base}/search`} className="tap inline-flex h-10 w-10 items-center justify-center rounded-md text-spine-muted hover:bg-spine-hover hover:text-on-spine" aria-label={t("common.search")}>
              <Search className="h-[18px] w-[18px]" />
            </Link>
            <NotificationBell slug={actor.tenant.slug} items={bell} unread={unread} allHref={`${base}/notifications`} onSpine />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-[1160px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
