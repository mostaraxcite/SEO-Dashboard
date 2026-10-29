"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, UserPlus } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { createClientAction, inviteAction } from "@/app/w/[slug]/actions";

export function NewClientButton({ slug, label }: { slug: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createClientAction.bind(null, slug), null);
  useEffect(() => {
    if (state?.ok && state.data) router.push(`/w/${slug}/clients/${state.data.id}`);
  }, [state, router, slug]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title={label} closeLabel={t("common.close")}>
        <form action={action} className="space-y-3.5">
          <Field label={t("common.name")} htmlFor="nc-name" error={state && !state.ok ? state.error : null}>
            <Input id="nc-name" name="name" required maxLength={120} autoFocus dir="auto" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Creates an invitation. The client org / role are stored server-side with the token;
 * the hidden field here only selects which org to invite for, and is re-validated.
 */
export function InviteButton({ slug, clientOrgId, roles, label }: { slug: string; clientOrgId?: string; roles: string[]; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(inviteAction.bind(null, slug), null);
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> {label ?? t("settings.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent title={label ?? t("settings.invite")} closeLabel={t("common.close")}>
        {state?.ok && state.data ? (
          <div className="space-y-3">
            <p className="text-sm text-success">{t("settings.inviteSent")}</p>
            <Field label={t("settings.inviteLink")} htmlFor="inv-link">
              <div className="flex gap-2">
                <Input id="inv-link" readOnly value={state.data.link} dir="ltr" className="text-xs" />
                <Button
                  onClick={() => {
                    void navigator.clipboard.writeText(state.data!.link);
                    setCopied(true);
                  }}
                >
                  <Copy className="h-4 w-4" /> {copied ? t("common.copied") : t("common.copy")}
                </Button>
              </div>
            </Field>
          </div>
        ) : (
          <form action={action} className="space-y-3.5">
            {clientOrgId ? <input type="hidden" name="clientOrgId" value={clientOrgId} /> : null}
            <Field label={t("common.email")} htmlFor="inv-email" error={state && !state.ok ? (state.fieldErrors?.email ?? state.error) : null}>
              <Input id="inv-email" name="email" type="email" required dir="ltr" autoFocus />
            </Field>
            {roles.length > 1 ? (
              <Field label={t("common.role")} htmlFor="inv-role">
                <Select id="inv-role" name="role" defaultValue={roles[0]}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {t(`settings.roles.${r}` as never)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="role" value={roles[0]} />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                {t("settings.invite")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
