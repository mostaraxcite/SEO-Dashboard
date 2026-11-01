import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { T, Locale } from "@/i18n";
import { formatDay, formatRelative } from "@/i18n";
import { Pill, publicStatusMeta } from "@/components/ui/status";
import type { RequestRow } from "@/server/services/requests";
import { publicStatus } from "@/server/services/requests";
import { Ref } from "@/components/ui/misc";

/** Requester-facing row: reference, title, plain status, expected date, last change. */
export function RequestCard({ r, href, t, locale }: { r: RequestRow; href: string; t: T; locale: Locale }) {
  const ps = publicStatus(r.status, r.pendingApproval);
  const meta = publicStatusMeta[ps];
  const triaged = !["new", "triage"].includes(r.status);
  const expected = triaged && r.committedDueDate ? formatDay(r.committedDueDate, locale, { year: "numeric" }) : triaged && r.committedFlexible ? t("common.flexible") : null;
  return (
    <Link href={href} className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-hover/60">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Ref>{r.publicRef}</Ref>
          <Pill tone={meta.tone} icon={meta.icon}>
            {t(`request.public.${ps}`)}
          </Pill>
        </div>
        <p className="mt-1 truncate font-medium text-fg group-hover:underline" dir="auto">
          {r.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {t("portal.expected")}: <span className="text-fg-2">{expected ?? t("portal.expectedPending")}</span>
          <span aria-hidden="true"> · </span>
          {t("common.updated")} {formatRelative(r.updatedAt, locale)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}
