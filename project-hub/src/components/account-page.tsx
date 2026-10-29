import type { Actor } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getAccount } from "@/server/services/account";
import { getPreferences } from "@/server/services/notifications";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { AccountForms, PreferenceTable } from "./account-forms";

export async function AccountPage({ actor }: { actor: Actor }) {
  const { t } = await getI18n();
  const [acc, prefs] = await Promise.all([getAccount(actor), getPreferences(actor)]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t("account.title")} description={acc.email} />
      <AccountForms slug={actor.tenant.slug} account={acc} smsAvailable={actor.tenant.features.sms} />
      <Panel>
        <PanelHeader title={t("notifications.preferences")} />
        <PreferenceTable slug={actor.tenant.slug} prefs={prefs} />
      </Panel>
    </div>
  );
}
