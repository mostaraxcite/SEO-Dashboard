"use client";
import { useActionState, useTransition } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { profileAction, smsAction } from "@/app/account-actions";
import { savePreference } from "@/app/notification-actions";

export function AccountForms({ slug, account, smsAvailable }: { slug: string; account: { name: string; phone: string | null; smsConsent: boolean }; smsAvailable: boolean }) {
  const { t } = useI18n();
  const [p, profile, pp] = useActionState(profileAction.bind(null, slug), null);
  const [s, sms, sp] = useActionState(smsAction.bind(null, slug), null);
  return (
    <>
      <Panel>
        <PanelHeader title={t("account.profile")} />
        <form action={profile} className="flex flex-wrap items-end gap-3 p-4">
          <Field label={t("common.name")} htmlFor="acc-name" className="min-w-60 flex-1" error={p && !p.ok ? p.error : null}>
            <Input id="acc-name" name="name" defaultValue={account.name} required maxLength={120} />
          </Field>
          <Button type="submit" loading={pp}>
            {p?.ok ? t("common.saved") : t("common.save")}
          </Button>
        </form>
      </Panel>
      {smsAvailable ? (
        <Panel>
          <PanelHeader title={t("notifications.channel.sms")} />
          <form action={sms} className="space-y-3 p-4">
            <Field label={t("account.phone")} htmlFor="acc-phone" help={t("account.phoneHelp")} error={s && !s.ok ? (s.fieldErrors?.phone ?? s.error) : null}>
              <Input id="acc-phone" name="phone" defaultValue={account.phone ?? ""} inputMode="tel" dir="ltr" className="max-w-xs" placeholder="+9665XXXXXXXX" />
            </Field>
            <Checkbox name="consent" defaultChecked={account.smsConsent} label={t("account.smsConsent")} help={t("account.smsConsentHelp")} />
            <Button type="submit" loading={sp}>
              {s?.ok ? t("common.saved") : t("common.save")}
            </Button>
          </form>
        </Panel>
      ) : null}
    </>
  );
}

export function PreferenceTable({ slug, prefs }: { slug: string; prefs: { event: string; channels: { channel: string; mode: string }[] }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [, start] = useTransition();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs text-muted">
            <th className="px-4 py-2 text-start font-medium">{t("notifications.title")}</th>
            {(["in_app", "email", "sms"] as const).map((c) => (
              <th key={c} className="px-3 py-2 text-start font-medium">
                {t(`notifications.channel.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {prefs.map((p) => (
            <tr key={p.event}>
              <td className="px-4 py-2 text-fg">{t.dyn(`notifications.types.${p.event}`, { ref: "REQ", title: "…", metric: "" })}</td>
              {(["in_app", "email", "sms"] as const).map((c) => {
                const ch = p.channels.find((x) => x.channel === c);
                return (
                  <td key={c} className="px-3 py-1.5">
                    {ch ? (
                      <Select
                        aria-label={`${t.dyn(`notifications.types.${p.event}`, { ref: "", title: "", metric: "" })} — ${t(`notifications.channel.${c}`)}`}
                        defaultValue={ch.mode}
                        className="h-8 w-36 text-sm"
                        onChange={(e) =>
                          start(async () => {
                            const r = await savePreference(slug, { event: p.event, channel: c, mode: e.target.value });
                            toast(r.ok ? { tone: "success", text: t("common.saved") } : { tone: "error", text: r.error });
                          })
                        }
                      >
                        <option value="immediate">{t("notifications.mode.immediate")}</option>
                        {c === "email" ? <option value="digest">{t("notifications.mode.digest")}</option> : null}
                        <option value="off">{t("notifications.mode.off")}</option>
                      </Select>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
