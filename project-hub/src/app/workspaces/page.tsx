import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { listWorkspacesFor } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { AuthShell } from "@/components/auth/auth-shell";
import { WorkspaceMark } from "@/components/shell/brand-style";
import { SignOutButton } from "./sign-out";

export const metadata = { title: "Workspaces" };

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { denied } = await searchParams;
  const { t } = await getI18n();
  const ws = await listWorkspacesFor(user.id);
  if (ws.length === 1 && !denied) redirect(ws[0].role === "client" ? `/portal/${ws[0].slug}` : `/w/${ws[0].slug}`);
  return (
    <AuthShell>
      <h1 className="mb-1 text-lg font-semibold">{t("auth.chooseWorkspace")}</h1>
      <p className="mb-4 text-sm text-muted">{user.email}</p>
      {denied ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{t("auth.accessDenied")}</p> : null}
      {ws.length === 0 ? <p className="text-fg-2">{t("auth.noWorkspaces")}</p> : null}
      <ul className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        {ws.map((w) => (
          <li key={w.slug} className="border-line [&+&]:border-t">
            <Link href={w.role === "client" ? `/portal/${w.slug}` : `/w/${w.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
              <WorkspaceMark name={w.theme?.displayName || w.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.theme?.displayName || w.name}</span>
                <span className="block text-xs text-muted">{t(`settings.roles.${w.role}` as never)}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/signup" className="text-accent hover:underline">
          {t("auth.createWorkspace")}
        </Link>
        <SignOutButton label={t("common.signOut")} />
      </div>
    </AuthShell>
  );
}
