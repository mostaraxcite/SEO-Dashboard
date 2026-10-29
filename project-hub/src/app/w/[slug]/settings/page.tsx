import { notFound } from "next/navigation";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { isAdmin } from "@/server/authz";
import { readSettings } from "@/server/services/settings";
import { listMembers, listCategories, pendingInvites } from "@/server/services/workspace";
import { listStaff } from "@/server/services/people";
import { aiUsage } from "@/server/ai/service";
import { formatDateTime } from "@/i18n";
import { PageHeader, Panel, PanelHeader, Avatar } from "@/components/ui/misc";
import { Pill } from "@/components/ui/status";
import { TabLink } from "@/components/shell/nav-link";
import { InviteButton } from "@/components/clients/client-forms";
import { AiForm, BrandingForm, CategoryForm, GeneralForm, LogoForm, NotificationForm, RoleSelect, SlaForm } from "./forms";

export const metadata = { title: "Settings" };
const TABS = ["general", "branding", "team", "types", "sla", "notifications", "ai", "usage"] as const;

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const actor = await requireStaff(slug);
  if (!isAdmin(actor)) notFound();
  const { t, locale } = await getI18n();
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "general";
  const s = await readSettings(actor);
  const base = `/w/${slug}/settings`;
  const labels: Record<string, string> = {
    general: t("settings.general"),
    branding: t("settings.branding"),
    team: t("settings.team"),
    types: t("settings.requestTypes"),
    sla: t("settings.sla"),
    notifications: t("settings.notifications"),
    ai: t("settings.ai"),
    usage: t("settings.usage"),
  };
  const visibleTabs = TABS.filter((x) => actor.tenant.mode === "requests" || !["types", "sla"].includes(x));
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("settings.title")} />
      <nav className="mb-5 flex gap-4 overflow-x-auto border-b border-line" aria-label={t("settings.title")}>
        {visibleTabs.map((x) => (
          <TabLink key={x} href={`${base}?tab=${x}`} label={labels[x]} isDefault={x === "general"} />
        ))}
      </nav>

      {tab === "general" ? (
        <Panel>
          <GeneralForm slug={slug} v={{ name: actor.tenant.name, mode: actor.tenant.mode, timezone: actor.tenant.timezone, defaultLocale: locale, sla: actor.tenant.features.sla, requireApprovalToDeliver: actor.tenant.features.requireApprovalToDeliver }} />
        </Panel>
      ) : null}

      {tab === "branding" ? (
        <div className="space-y-5">
          <Panel>
            <BrandingForm slug={slug} v={{ brandColor: actor.tenant.theme.brandColor ?? null, displayName: actor.tenant.theme.displayName ?? null, welcomeEn: actor.tenant.theme.welcomeEn ?? null, welcomeAr: actor.tenant.theme.welcomeAr ?? null }} />
          </Panel>
          <Panel>
            <LogoForm slug={slug} logoId={actor.tenant.theme.logoFileId ?? null} />
          </Panel>
        </div>
      ) : null}

      {tab === "team" ? <TeamTab slug={slug} actorId={actor.user.id} t={t} actor={actor} /> : null}

      {tab === "types" ? <TypesTab slug={slug} t={t} actor={actor} /> : null}

      {tab === "sla" ? (
        <Panel>
          <SlaForm slug={slug} v={{ ...s.sla, ...s.cal, enabled: actor.tenant.features.sla }} />
        </Panel>
      ) : null}

      {tab === "notifications" ? (
        <Panel>
          <NotificationForm slug={slug} v={{ emailEnabled: s.ns.emailEnabled, inAppEnabled: s.ns.inAppEnabled, sms: s.ns.sms }} />
        </Panel>
      ) : null}

      {tab === "ai" ? (
        <div className="space-y-5">
          <Panel>
            <AiForm slug={slug} v={s.ai} />
          </Panel>
          <UsagePanel actor={actor} t={t} />
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="space-y-5">
          <UsagePanel actor={actor} t={t} />
          <Panel>
            <PanelHeader title={t("settings.deliveries")} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {s.deliveries.map(({ d, email }) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2 text-xs text-muted">{formatDateTime(d.createdAt, locale, actor.tenant.timezone)}</td>
                      <td className="px-3 py-2 uppercase text-xs">{d.channel}</td>
                      <td className="px-3 py-2" dir="ltr">{email}</td>
                      <td className="px-3 py-2">{d.template}</td>
                      <td className="px-4 py-2">
                        <Pill tone={d.status === "sent" ? "success" : d.status === "dead" || d.status === "failed" ? "danger" : "neutral"}>
                          {d.status === "skipped" ? t("notifications.smsNotSent", { reason: d.skipReason ?? "" }) : d.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title={t("settings.auditLog")} />
            <ul className="divide-y divide-line text-sm">
              {s.audit.map(({ a, name }) => (
                <li key={a.id} className="flex flex-wrap gap-x-3 px-4 py-2">
                  <span className="text-xs text-muted">{formatDateTime(a.createdAt, locale, actor.tenant.timezone)}</span>
                  <span className="font-medium">{name ?? "system"}</span>
                  <code className="text-xs text-fg-2">{a.action}</code>
                  <span className="text-xs text-muted">{a.entityType}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

async function UsagePanel({ actor, t }: { actor: Awaited<ReturnType<typeof requireStaff>>; t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  const u = await aiUsage(actor);
  return (
    <Panel>
      <PanelHeader title={t("settings.aiUsage")} description={`${t("settings.aiProvider")}: ${u.provider === "mock" ? t("ai.mockBadge") : u.provider}`} />
      <dl className="grid grid-cols-3 divide-x divide-line rtl:divide-x-reverse">
        <div className="px-4 py-3">
          <dt className="text-sm text-muted">{t("settings.aiRuns")}</dt>
          <dd className="tnum text-lg font-semibold">{u.ok}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-sm text-muted">{t("settings.aiErrors")}</dt>
          <dd className="tnum text-lg font-semibold">{u.errors}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-sm text-muted">{t("settings.aiCost")}</dt>
          <dd className="tnum text-lg font-semibold">${u.cost.toFixed(2)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

async function TeamTab({ slug, actorId, t, actor }: { slug: string; actorId: string; t: Awaited<ReturnType<typeof getI18n>>["t"]; actor: Awaited<ReturnType<typeof requireStaff>> }) {
  const [members, invites] = await Promise.all([listMembers(actor), pendingInvites(actor)]);
  const staff = members.filter((m) => m.role !== "client");
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title={t("settings.members")} actions={<InviteButton slug={slug} roles={["member", "manager", "admin", "guest"]} />} />
        <ul className="divide-y divide-line">
          {staff.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={m.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.name}</span>
                <span className="block truncate text-xs text-muted" dir="ltr">{m.email}</span>
              </span>
              <RoleSelect slug={slug} userId={m.id} role={m.role} disabled={m.id === actorId || m.role === "owner"} />
            </li>
          ))}
        </ul>
      </Panel>
      {invites.length ? (
        <Panel>
          <PanelHeader title={t("settings.pendingInvites")} />
          <ul className="divide-y divide-line text-sm">
            {invites.map((i) => (
              <li key={i.email + i.role} className="flex justify-between px-4 py-2">
                <span dir="ltr">{i.email}</span>
                <span className="text-muted">{t(`settings.roles.${i.role}` as never)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

async function TypesTab({ slug, t, actor }: { slug: string; t: Awaited<ReturnType<typeof getI18n>>["t"]; actor: Awaited<ReturnType<typeof requireStaff>> }) {
  const [cats, people] = await Promise.all([listCategories(actor, { includeDisabled: true }), listStaff(actor)]);
  return (
    <Panel>
      <PanelHeader title={t("settings.requestTypes")} description={t("intake.chooseType")} />
      <div className="space-y-2 p-4">
        {cats.map((c) => (
          <CategoryForm key={c.id} slug={slug} c={c} people={people} />
        ))}
      </div>
    </Panel>
  );
}
