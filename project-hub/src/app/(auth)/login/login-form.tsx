"use client";
import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { loginAction, magicLinkAction } from "../actions";

export function LoginForm({ next, devMailbox }: { next: string; devMailbox: boolean }) {
  const { t } = useI18n();
  const [state, login, loggingIn] = useActionState(loginAction, null);
  const [magic, sendMagic, sending] = useActionState(magicLinkAction, null);
  return (
    <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
      <h1 className="text-lg font-semibold">{t("auth.signInTitle")}</h1>
      <p className="mt-0.5 text-sm text-muted">{t("auth.signInSubtitle")}</p>
      <form action={login} className="mt-5 space-y-3.5">
        <input type="hidden" name="next" value={next} />
        <Field label={t("common.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
        </Field>
        {state && !state.ok ? (
          <p role="alert" className="text-sm text-danger">
            {state.code === "invalid" ? t("auth.invalidCredentials") : state.error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full justify-center" loading={loggingIn}>
          {t("auth.signInWithPassword")}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        {t("auth.orEmailLink")}
        <span className="h-px flex-1 bg-line" />
      </div>
      {magic?.ok ? (
        <div role="status" className="flex gap-2 rounded-md bg-success-soft px-3 py-2.5 text-sm text-success">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t("auth.linkSent")}
            {devMailbox ? (
              <>
                {" "}
                <Link href="/dev/mailbox" className="underline">
                  {t("auth.devMailbox")}
                </Link>
              </>
            ) : null}
          </span>
        </div>
      ) : (
        <form action={sendMagic} className="flex gap-2">
          <input type="hidden" name="next" value={next} />
          <label className="flex-1">
            <span className="sr-only">{t("common.email")}</span>
            <Input name="email" type="email" required placeholder={t("common.email")} dir="ltr" />
          </label>
          <Button type="submit" loading={sending}>
            {t("auth.sendLink")}
          </Button>
        </form>
      )}
      {magic && !magic.ok ? <p className="mt-2 text-sm text-danger">{magic.error}</p> : null}
      <p className="mt-6 text-center text-sm text-muted">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          {t("auth.createWorkspace")}
        </Link>
      </p>
    </div>
  );
}
