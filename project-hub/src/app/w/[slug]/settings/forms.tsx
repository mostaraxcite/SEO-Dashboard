"use client";
import { useActionState, useState, useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { brandPalette } from "@/lib/color";
import type { ActionResult } from "@/server/action";
import { saveAi, saveBranding, saveCategory, saveGeneral, saveNotifications, saveSla, setRoleAction, uploadLogo, removeLogo } from "./actions";

type Act = (state: ActionResult | null, fd: FormData) => Promise<ActionResult>;

function SettingsForm({ action, children, disabled }: { action: Act; children: React.ReactNode; disabled?: boolean }) {
  const { t } = useI18n();
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="space-y-4 p-4">
      <fieldset disabled={disabled} className="space-y-4">
        {children}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
          {t("common.save")}
        </Button>
        {state?.ok ? <span role="status" className="text-sm text-success">{t("common.saved")}</span> : null}
        {state && !state.ok ? <span role="alert" className="text-sm text-danger">{state.error}</span> : null}
      </div>
    </form>
  );
}

export function GeneralForm({ slug, v }: { slug: string; v: { name: string; mode: string; timezone: string; defaultLocale: string; sla: boolean; requireApprovalToDeliver: boolean } }) {
  const { t } = useI18n();
  return (
    <SettingsForm action={saveGeneral.bind(null, slug)}>
      <Field label={t("settings.workspaceName")} htmlFor="g-name">
        <Input id="g-name" name="name" defaultValue={v.name} required maxLength={80} />
      </Field>
      <Field label={t("settings.mode")} htmlFor="g-mode">
        <Select id="g-mode" name="mode" defaultValue={v.mode}>
          <option value="simple">{t("settings.modeSimple")}</option>
          <option value="requests">{t("settings.modeRequests")}</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("settings.timezone")} htmlFor="g-tz">
          <Input id="g-tz" name="timezone" defaultValue={v.timezone} required dir="ltr" placeholder="Asia/Riyadh" />
        </Field>
        <Field label={t("settings.defaultLocale")} htmlFor="g-loc">
          <Select id="g-loc" name="defaultLocale" defaultValue={v.defaultLocale}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </Select>
        </Field>
      </div>
      <Checkbox name="sla" defaultChecked={v.sla} label={t("settings.slaEnabled")} help={t("settings.slaHelp")} />
      <Checkbox name="requireApprovalToDeliver" defaultChecked={v.requireApprovalToDeliver} label={t("settings.requireManagerDeliver")} />
    </SettingsForm>
  );
}

export function BrandingForm({ slug, v }: { slug: string; v: { brandColor: string | null; displayName: string | null; welcomeEn: string | null; welcomeAr: string | null } }) {
  const { t } = useI18n();
  const [color, setColor] = useState(v.brandColor ?? "#273a37");
  const palette = brandPalette(color);
  return (
    <SettingsForm action={saveBranding.bind(null, slug)}>
      <Field label={t("settings.brandColor")} htmlFor="b-color" help={t("settings.brandColorHelp")}>
        <div className="flex items-center gap-3">
          <input type="color" aria-label={t("settings.brandColor")} value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#273a37"} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line-strong bg-surface" />
          <Input id="b-color" name="brandColor" value={color} onChange={(e) => setColor(e.target.value)} className="w-32" dir="ltr" pattern="#[0-9a-fA-F]{6}" />
        </div>
      </Field>
      {palette ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas p-3">
          <span className="text-sm text-muted">{t("settings.preview")}</span>
          <span className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium" style={{ background: palette.light.brand, color: palette.light.on }}>
            {t("nav.newRequest")}
          </span>
          <span className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium" style={{ background: palette.dark.brand, color: palette.dark.on }}>
            {t("common.dark")}
          </span>
          {palette.adjusted ? <span className="text-sm text-warning">{t("settings.brandAdjusted", { color: palette.light.brand })}</span> : null}
        </div>
      ) : null}
      <Field label={t("settings.displayName")} htmlFor="b-name">
        <Input id="b-name" name="displayName" defaultValue={v.displayName ?? ""} maxLength={80} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("settings.welcome")} (EN)`} htmlFor="b-wen">
          <Textarea id="b-wen" name="welcomeEn" defaultValue={v.welcomeEn ?? ""} rows={2} maxLength={280} dir="ltr" />
        </Field>
        <Field label={`${t("settings.welcome")} (AR)`} htmlFor="b-war">
          <Textarea id="b-war" name="welcomeAr" defaultValue={v.welcomeAr ?? ""} rows={2} maxLength={280} dir="rtl" />
        </Field>
      </div>
    </SettingsForm>
  );
}

export function LogoForm({ slug, logoId }: { slug: string; logoId: string | null }) {
  const hasLogo = !!logoId;
  const { t } = useI18n();
  const [state, run, pending] = useActionState(uploadLogo.bind(null, slug), null);
  const [, start] = useTransition();
  return (
    <form action={run} className="space-y-3 p-4">
      <Field label={t("settings.logo")} htmlFor="logo" help={t("settings.logoHelp")} error={state && !state.ok ? state.error : null}>
        <div className="flex flex-wrap items-center gap-3">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/logo/${slug}?v=${logoId}`} alt="" className="h-10 w-auto max-w-40 rounded border border-line bg-surface object-contain p-1" />
          ) : null}
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="text-sm file:me-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
        </div>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
        {hasLogo ? (
          <Button variant="ghost" onClick={() => start(async () => void (await removeLogo(slug)))}>
            {t("common.remove")}
          </Button>
        ) : null}
        {state?.ok ? <span className="self-center text-sm text-success">{t("common.saved")}</span> : null}
      </div>
    </form>
  );
}

export function SlaForm({ slug, v }: { slug: string; v: { firstResponseMinutes: number; triageMinutes: number; warnAtPercent: number; pauseTriageOnNeedsInfo: boolean; workDays: number[]; startMinute: number; endMinute: number; holidays: string[]; enabled: boolean } }) {
  const { t, locale } = useI18n();
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const dayName = (d: number) => new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { weekday: "short" }).format(new Date(Date.UTC(2024, 0, d)));
  return (
    <SettingsForm action={saveSla.bind(null, slug)}>
      {!v.enabled ? <p className="rounded-md bg-neutral-soft px-3 py-2 text-sm text-fg-2">{t("settings.slaHelp")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("settings.firstResponseTarget")} htmlFor="s-fr">
          <Input id="s-fr" name="firstResponseHours" type="number" step="0.5" min="0.5" defaultValue={v.firstResponseMinutes / 60} />
        </Field>
        <Field label={t("settings.triageTarget")} htmlFor="s-tr">
          <Input id="s-tr" name="triageHours" type="number" step="0.5" min="0.5" defaultValue={v.triageMinutes / 60} />
        </Field>
        <Field label={t("settings.warnAt")} htmlFor="s-w">
          <Input id="s-w" name="warnAtPercent" type="number" min="10" max="99" defaultValue={v.warnAtPercent} />
        </Field>
      </div>
      <Checkbox name="pauseTriageOnNeedsInfo" defaultChecked={v.pauseTriageOnNeedsInfo} label={t("settings.pauseOnNeedsInfo")} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("settings.workDays")}</legend>
        <div className="flex flex-wrap gap-3">
          {[7, 1, 2, 3, 4, 5, 6].map((d) => (
            <Checkbox key={d} name="workDays" value={String(d)} defaultChecked={v.workDays.includes(d)} label={dayName(d)} />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t("settings.workHours")} — start`} htmlFor="s-st">
          <Input id="s-st" name="startTime" type="time" defaultValue={hhmm(v.startMinute)} />
        </Field>
        <Field label={`${t("settings.workHours")} — end`} htmlFor="s-en">
          <Input id="s-en" name="endTime" type="time" defaultValue={hhmm(v.endMinute)} />
        </Field>
      </div>
      <Field label={t("settings.holidays")} htmlFor="s-h">
        <Textarea id="s-h" name="holidays" defaultValue={v.holidays.join("\n")} rows={3} dir="ltr" />
      </Field>
    </SettingsForm>
  );
}

export function NotificationForm({ slug, v }: { slug: string; v: { emailEnabled: boolean; inAppEnabled: boolean; sms: { enabled: boolean; senderId: string | null; monthlySegmentQuota: number; recipientCooldownMinutes: number; costPerSegmentUsd: number; allowedEvents: string[] } } }) {
  const { t } = useI18n();
  return (
    <SettingsForm action={saveNotifications.bind(null, slug)}>
      <Checkbox name="inAppEnabled" defaultChecked={v.inAppEnabled} label={t("settings.inAppEnabled")} />
      <Checkbox name="emailEnabled" defaultChecked={v.emailEnabled} label={t("settings.emailEnabled")} help={t("settings.emailMockNote")} />
      <div className="rounded-md border border-line p-3">
        <p className="font-medium">{t("settings.smsTitle")}</p>
        <p className="mb-3 text-sm text-muted">{t("settings.smsHelp")}</p>
        <div className="space-y-3">
          <Checkbox name="smsEnabled" defaultChecked={v.sms.enabled} label={t("settings.smsEnabled")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("settings.smsSender")} htmlFor="n-sender">
              <Input id="n-sender" name="senderId" defaultValue={v.sms.senderId ?? ""} maxLength={11} dir="ltr" />
            </Field>
            <Field label={t("settings.smsQuota")} htmlFor="n-q">
              <Input id="n-q" name="monthlySegmentQuota" type="number" min="0" defaultValue={v.sms.monthlySegmentQuota} />
            </Field>
            <Field label={t("settings.smsCooldown")} htmlFor="n-c">
              <Input id="n-c" name="recipientCooldownMinutes" type="number" min="0" defaultValue={v.sms.recipientCooldownMinutes} />
            </Field>
            <Field label={t("settings.smsCost")} htmlFor="n-cost">
              <Input id="n-cost" name="costPerSegmentUsd" type="number" step="0.01" min="0" defaultValue={v.sms.costPerSegmentUsd} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">{t("settings.smsEvents")}</legend>
            <div className="flex flex-wrap gap-4">
              {(["request.delivered", "approval.requested"] as const).map((e) => (
                <Checkbox key={e} name="allowedEvents" value={e} defaultChecked={v.sms.allowedEvents.includes(e)} label={t.dyn(`notifications.types.${e}`, { ref: "REQ", title: "" })} />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </SettingsForm>
  );
}

export function AiForm({ slug, v }: { slug: string; v: { enabled: boolean; features: Record<string, boolean>; clientsMayUse: boolean; monthlyActionLimit: number; monthlySpendCapUsd: string; perUserHourlyLimit: number } }) {
  const { t } = useI18n();
  return (
    <SettingsForm action={saveAi.bind(null, slug)}>
      <Checkbox name="enabled" defaultChecked={v.enabled} label={t("settings.aiEnabled")} help={t("settings.aiHelp")} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("settings.aiFeatures")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox name="summarize" defaultChecked={v.features.summarize} label={t("ai.summarize")} />
          <Checkbox name="improve_brief" defaultChecked={v.features.improve_brief} label={t("ai.improveBrief")} />
          <Checkbox name="suggest_tasks" defaultChecked={v.features.suggest_tasks} label={t("ai.suggestTasks")} />
          <Checkbox name="next_steps" defaultChecked={v.features.next_steps} label={t("ai.nextSteps")} />
        </div>
      </fieldset>
      <Checkbox name="clientsMayUse" defaultChecked={v.clientsMayUse} label={t("settings.aiClients")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("settings.aiMonthlyLimit")} htmlFor="a-lim">
          <Input id="a-lim" name="monthlyActionLimit" type="number" min="0" defaultValue={v.monthlyActionLimit} />
        </Field>
        <Field label={t("settings.aiSpendCap")} htmlFor="a-cap">
          <Input id="a-cap" name="monthlySpendCapUsd" type="number" step="0.01" min="0" defaultValue={v.monthlySpendCapUsd} />
        </Field>
        <Field label={t("settings.aiHourly")} htmlFor="a-hr">
          <Input id="a-hr" name="perUserHourlyLimit" type="number" min="0" defaultValue={v.perUserHourlyLimit} />
        </Field>
      </div>
    </SettingsForm>
  );
}

export function CategoryForm({ slug, c, people }: { slug: string; c: { id: string; labelEn: string; labelAr: string; helpEn: string; helpAr: string; enabled: boolean; position: number; defaultOwnerId: string | null; fields: { labelEn: string; labelAr: string }[] }; people: { id: string; name: string }[] }) {
  const { t } = useI18n();
  return (
    <details className="group rounded-md border border-line">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5">
        <span className="font-medium">
          {c.labelEn} · <span dir="rtl">{c.labelAr}</span>
        </span>
        <span className="text-xs text-muted">{c.enabled ? t("settings.categoryEnabled") : t("common.disabledReason")}</span>
      </summary>
      <div className="border-t border-line">
        <SettingsForm action={saveCategory.bind(null, slug, c.id)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("settings.labelEn")} htmlFor={`c-le-${c.id}`}>
              <Input id={`c-le-${c.id}`} name="labelEn" defaultValue={c.labelEn} maxLength={60} dir="ltr" />
            </Field>
            <Field label={t("settings.labelAr")} htmlFor={`c-la-${c.id}`}>
              <Input id={`c-la-${c.id}`} name="labelAr" defaultValue={c.labelAr} maxLength={60} dir="rtl" />
            </Field>
            <Field label={t("settings.helpEn")} htmlFor={`c-he-${c.id}`}>
              <Input id={`c-he-${c.id}`} name="helpEn" defaultValue={c.helpEn} maxLength={200} dir="ltr" />
            </Field>
            <Field label={t("settings.helpAr")} htmlFor={`c-ha-${c.id}`}>
              <Input id={`c-ha-${c.id}`} name="helpAr" defaultValue={c.helpAr} maxLength={200} dir="rtl" />
            </Field>
            <Field label={t("settings.routeTo")} htmlFor={`c-o-${c.id}`}>
              <Select id={`c-o-${c.id}`} name="defaultOwnerId" defaultValue={c.defaultOwnerId ?? ""}>
                <option value="">{t("common.none")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="#" htmlFor={`c-p-${c.id}`}>
              <Input id={`c-p-${c.id}`} name="position" type="number" min="0" max="100" defaultValue={c.position} />
            </Field>
          </div>
          <Checkbox name="enabled" defaultChecked={c.enabled} label={t("settings.categoryEnabled")} />
          {c.fields.length ? (
            <p className="text-sm text-muted">
              {t("settings.followUps")}: {c.fields.map((f) => f.labelEn).join(" · ")}
            </p>
          ) : null}
        </SettingsForm>
      </div>
    </details>
  );
}

export function RoleSelect({ slug, userId, role, disabled }: { slug: string; userId: string; role: string; disabled: boolean }) {
  const { t } = useI18n();
  const [, start] = useTransition();
  if (disabled) return <span className="text-sm text-fg-2">{t(`settings.roles.${role}` as never)}</span>;
  return (
    <Select aria-label={t("common.role")} defaultValue={role} className="h-8 w-32 text-sm" onChange={(e) => start(async () => void (await setRoleAction(slug, userId, e.target.value)))}>
      {["admin", "manager", "member", "guest"].map((r) => (
        <option key={r} value={r}>
          {t(`settings.roles.${r}` as never)}
        </option>
      ))}
    </Select>
  );
}
