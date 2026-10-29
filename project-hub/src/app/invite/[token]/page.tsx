import { AuthShell } from "@/components/auth/auth-shell";
import { getI18n } from "@/server/i18n";
import { getSessionUser } from "@/server/auth/session";
import { getInvite } from "@/server/services/auth";
import { InviteForm } from "./invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getI18n();
  const [invite, user] = await Promise.all([getInvite(token), getSessionUser()]);
  return (
    <AuthShell>
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t("auth.inviteTitle")}</h1>
        {!invite ? (
          <p className="mt-2 text-fg-2">{t("auth.inviteInvalid")}</p>
        ) : user && user.email.toLowerCase() !== invite.inv.email.toLowerCase() ? (
          <p className="mt-2 text-fg-2">{t("auth.inviteWrongUser", { email: invite.inv.email })}</p>
        ) : (
          <>
            <p className="mt-1 text-fg-2">{t("auth.inviteBody", { inviter: invite.inviterName ?? "—", workspace: invite.tenantName })}</p>
            <p className="mt-1 text-sm text-muted" dir="ltr">
              {invite.inv.email}
            </p>
            <InviteForm token={token} signedIn={!!user} isClient={invite.inv.role === "client"} />
          </>
        )}
      </div>
    </AuthShell>
  );
}
