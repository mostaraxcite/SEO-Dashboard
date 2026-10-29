"use client";
import { useActionState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { acceptInviteAction } from "@/app/(auth)/actions";

/** Only the token is submitted; role/tenant/client come from the stored invitation. */
export function InviteForm({ token, signedIn, isClient }: { token: string; signedIn: boolean; isClient: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="mt-5 space-y-3.5">
      <input type="hidden" name="token" value={token} />
      {!signedIn ? (
        <>
          <Field label={t("auth.yourName")} htmlFor="name">
            <Input id="name" name="name" required autoComplete="name" />
          </Field>
          <Field label={isClient ? t("auth.setPassword") : t("auth.password")} htmlFor="password" help={t("auth.passwordHelp")}>
            <Input id="password" name="password" type="password" minLength={10} required={!isClient} autoComplete="new-password" dir="ltr" />
          </Field>
        </>
      ) : null}
      {state && !state.ok ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" variant="primary" className="w-full justify-center" loading={pending}>
        {t("auth.inviteAccept")}
      </Button>
    </form>
  );
}
