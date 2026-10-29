"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { signupAction } from "../actions";

export function SignupForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(signupAction, null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const types = [
    ["team", t("auth.typeTeam"), t("auth.typeTeamHelp")],
    ["agency", t("auth.typeAgency"), t("auth.typeAgencyHelp")],
    ["internal", t("auth.typeInternal"), t("auth.typeInternalHelp")],
  ] as const;
  return (
    <form action={action} className="space-y-4 rounded-lg border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-lg font-semibold">{t("auth.signupTitle")}</h1>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label={t("auth.yourName")} htmlFor="name" error={fe.name}>
          <Input id="name" name="name" required autoComplete="name" />
        </Field>
        <Field label={t("common.email")} htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" required autoComplete="email" dir="ltr" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" help={t("auth.passwordHelp")} error={fe.password}>
          <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" dir="ltr" />
        </Field>
        <Field label={t("auth.workspaceName")} htmlFor="ws" error={fe.workspaceName}>
          <Input id="ws" name="workspaceName" required maxLength={80} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("auth.workspaceType")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {types.map(([v, label, help], i) => (
            <label key={v} className="flex cursor-pointer flex-col gap-0.5 rounded-md border border-line p-3 hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="type" value={v} defaultChecked={i === 0} className="accent-[color:var(--brand)]" />
                {label}
              </span>
              <span className="ps-6 text-xs text-muted">{help}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {state && !state.ok && !Object.keys(fe).length ? <p className="text-sm text-danger">{state.error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <Link href="/login" className="text-sm text-fg-2 hover:underline">
          {t("auth.signIn")}
        </Link>
        <Button type="submit" variant="primary" loading={pending}>
          {t("auth.createWorkspace")}
        </Button>
      </div>
    </form>
  );
}
