"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Check, Languages, LogOut, Monitor, Moon, Repeat, Sun, UserRound } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/misc";
import { setLocale, setTheme } from "@/app/preferences-actions";
import { signOut } from "@/app/(auth)/actions";
import { useI18n } from "@/components/i18n-provider";

export function UserMenu({
  name,
  email,
  theme,
  accountHref,
  compact,
  onSpine,
}: {
  name: string;
  email: string;
  theme: "system" | "light" | "dark";
  accountHref: string;
  compact?: boolean;
  onSpine?: boolean;
}) {
  const { t, locale } = useI18n();
  const [, start] = useTransition();
  return (
    <Menu>
      <MenuTrigger
        className={`flex min-w-0 items-center gap-2 rounded-md p-1 text-start ${onSpine ? "hover:bg-spine-hover data-[state=open]:bg-spine-active" : "hover:bg-hover data-[state=open]:bg-hover"}`}
        aria-label={t("common.account")}
      >
        <Avatar name={name} size={28} />
        {compact ? null : (
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-medium ${onSpine ? "text-on-spine" : "text-fg"}`}>{name}</span>
            <span className={`block truncate text-xs ${onSpine ? "text-spine-muted" : "text-muted"}`}>{email}</span>
          </span>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} className="w-60">
        <MenuLabel>{email}</MenuLabel>
        <MenuItem asChild>
          <Link href={accountHref}>
            <UserRound /> {t("common.account")}
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/workspaces">
            <Repeat /> {t("nav.switchWorkspace")}
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("common.language")}</MenuLabel>
        {(["en", "ar"] as const).map((l) => (
          <MenuItem key={l} onSelect={() => start(() => setLocale(l))} lang={l}>
            <Languages /> <span className="flex-1">{l === "en" ? "English" : "العربية"}</span>
            {locale === l ? <Check className="!text-fg" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLabel>{t("common.theme")}</MenuLabel>
        {(
          [
            ["light", <Sun key="l" />, t("common.light")],
            ["dark", <Moon key="d" />, t("common.dark")],
            ["system", <Monitor key="s" />, t("common.system")],
          ] as const
        ).map(([v, icon, label]) => (
          <MenuItem key={v} onSelect={() => start(() => setTheme(v))}>
            {icon} <span className="flex-1">{label}</span>
            {theme === v ? <Check className="!text-fg" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => start(() => signOut())}>
          <LogOut /> {t("common.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
