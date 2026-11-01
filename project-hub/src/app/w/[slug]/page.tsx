import Link from "next/link";
import { CircleCheckBig, Hourglass } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { myWork } from "@/server/services/tasks";
import { listStaff } from "@/server/services/people";
import { isManager } from "@/server/authz";
import { PageHeader, Panel, PanelHeader, EmptyState } from "@/components/ui/misc";
import { TaskList } from "@/components/work/task-list";
import { QuickAddTask } from "@/components/work/quick-add";
import { DueLabel } from "@/components/work/due";
import { formatDay } from "@/i18n";

export const metadata = { title: "My work" };

export default async function MyWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const [w, people] = await Promise.all([myWork(actor), listStaff(actor)]);
  const firstName = actor.user.name.split(" ")[0];
  const showTriage = actor.tenant.mode === "requests" && isManager(actor);
  const counters = [
    showTriage ? { label: t("home.needsTriage"), value: w.counts.needsTriage, href: `/w/${slug}/inbox`, tone: w.counts.needsTriage ? "text-accent" : "" } : null,
    { label: t("home.assigned"), value: w.counts.assigned, href: "#later", tone: "" },
    { label: t("home.dueSoon"), value: w.counts.dueSoon, href: "#due-soon", tone: w.counts.dueSoon ? "text-warning" : "" },
    { label: t("home.overdue"), value: w.counts.overdue, href: "#attention", tone: w.counts.overdue ? "text-danger" : "" },
  ].filter(Boolean) as { label: string; value: number; href: string; tone: string }[];
  const nothing = !w.attention.length && !w.dueSoon.length && !w.later.length;

  const today = formatDay(w.today, locale, { weekday: "long", day: "numeric", month: "long" });
  const groups = [
    { id: "attention", label: t("home.needsAttention"), items: w.attention },
    { id: "due-soon", label: t("home.dueSoon"), items: w.dueSoon },
    { id: "later", label: t("home.upcoming"), items: w.later },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader eyebrow={today} title={t("home.greeting", { name: firstName })} />
      {/* Counters are filters/anchors into the list below — not dashboard cards. */}
      <nav aria-label={t("home.title")} className="-mt-2 mb-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {counters.map((c) => (
          <Link key={c.label} href={c.href} className="group inline-flex items-baseline gap-1.5 text-fg-2 hover:text-fg">
            <span className={`ref text-[0.8125rem] font-medium ${c.tone || "text-fg"}`}>{c.value}</span>
            <span className="group-hover:underline underline-offset-4">{c.label}</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {/* One sheet, grouped by what needs you first. */}
          <Panel>
            <QuickAddTask slug={slug} people={people} defaultAssigneeId={actor.user.id} />
            {nothing ? (
              <EmptyState icon={<CircleCheckBig />} title={t("home.nothingAssigned")} body={t("home.nothingAssignedBody")} className="border-t border-line" />
            ) : (
              groups.map((g) => (
                <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="border-t border-line">
                  <h2 id={`${g.id}-h`} className="flex items-center justify-between bg-sunken px-4 py-1.5">
                    <span className="label">{g.label}</span>
                    <span className="ref text-muted">{g.items.length}</span>
                  </h2>
                  <TaskList slug={slug} tasks={g.items} today={w.today} />
                </section>
              ))
            )}
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel>
            <PanelHeader title={t("home.myDependencies")} description={w.myDependencies.length ? undefined : t("dependency.none")} />
            {w.myDependencies.length ? (
              <ul className="divide-y divide-line">
                {w.myDependencies.map((d) => (
                  <li key={d.id} className="px-4 py-2.5">
                    <Link href={d.taskId ? `/w/${slug}/tasks/${d.taskId}` : `/w/${slug}/requests/${d.requestRef}`} className="flex items-start gap-2 hover:underline">
                      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      <span className="min-w-0 flex-1" dir="auto">
                        {d.title}
                      </span>
                    </Link>
                    <div className="mt-1 flex items-center justify-between ps-6 text-xs text-muted">
                      <span>{t("dependency.waitingOn", { party: d.partyName })}</span>
                      <DueLabel date={d.dueDate} today={w.today} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          {w.recentlyDone.length ? (
            <Panel>
              <PanelHeader title={t("home.recentlyDone")} />
              <TaskList slug={slug} tasks={w.recentlyDone} today={w.today} showContext={false} dense />
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
