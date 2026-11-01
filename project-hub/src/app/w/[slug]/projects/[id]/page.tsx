import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, LayoutList, Columns3 } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getProject, projectExtras } from "@/server/services/projects";
import { listTasks } from "@/server/services/tasks";
import { listStaff } from "@/server/services/people";
import { signedFileUrl } from "@/server/services/files";
import { isManager } from "@/server/authz";
import { AppError } from "@/server/errors";
import { formatDay, todayIn } from "@/i18n";
import { Panel, PanelHeader, Meta, ProgressBar, Avatar, Ref } from "@/components/ui/misc";
import { Pill, requestStatusMeta } from "@/components/ui/status";
import { TabLink } from "@/components/shell/nav-link";
import { TaskList } from "@/components/work/task-list";
import { QuickAddTask } from "@/components/work/quick-add";
import { FileList } from "@/components/work/files";
import { Timeline } from "@/components/work/timeline";
import { Board } from "@/components/projects/board";
import { ProjectStatusSelect } from "@/components/projects/new-project";
import { cn } from "@/lib/cn";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string; view?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const p = await getProject(actor, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [tasks, people, extras] = await Promise.all([listTasks(actor, { projectId: id }), listStaff(actor), projectExtras(actor, id)]);
  const today = todayIn(actor.tenant.timezone);
  const tab = ["tasks", "files", "activity"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const base = `/w/${slug}/projects/${id}`;
  const done = tasks.filter((x) => x.status === "done").length;
  const canManage = isManager(actor) || p.ownerId === actor.user.id || p.createdBy === actor.user.id;
  const board = sp.view === "board";
  return (
    <div className="space-y-5">
      <Link href={`/w/${slug}/projects`} className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t("project.projects")}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {p.clientName ? <p className="text-sm font-medium text-fg-2">{p.clientName}</p> : null}
          <h1 className="text-xl font-semibold" dir="auto">
            {p.name}
          </h1>
        </div>
        <ProjectStatusSelect slug={slug} id={id} value={p.status} disabled={!canManage} />
      </header>
      <nav className="flex gap-5 border-b border-line" aria-label={t("common.project")}>
        <TabLink href={`${base}?tab=overview`} label={t("project.overview")} isDefault />
        <TabLink href={`${base}?tab=tasks`} label={t("project.tasks")} count={tasks.length} />
        <TabLink href={`${base}?tab=files`} label={t("project.files")} count={extras.files.length} />
        <TabLink href={`${base}?tab=activity`} label={t("project.activity")} />
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {p.description ? (
              <Panel className="p-4">
                <p className="whitespace-pre-wrap text-fg-2" dir="auto">{p.description}</p>
              </Panel>
            ) : null}
            <Panel>
              <PanelHeader title={t("project.openTasks")} actions={<Link href={`${base}?tab=tasks`} className="text-sm text-accent hover:underline">{t("common.viewAll")}</Link>} />
              <TaskList slug={slug} tasks={tasks.filter((x) => x.status !== "done").slice(0, 8)} today={today} showContext={false} empty={<p className="px-4 py-3 text-sm text-muted">{t("task.empty")}</p>} />
              <div className="border-t border-line">
                <QuickAddTask slug={slug} projectId={id} people={people} />
              </div>
            </Panel>
            {extras.requests.length ? (
              <Panel>
                <PanelHeader title={t("request.requests")} />
                <ul className="divide-y divide-line">
                  {extras.requests.map((r) => (
                    <li key={r.id}>
                      <Link href={`/w/${slug}/requests/${r.publicRef}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                        <Ref>{r.publicRef}</Ref>
                        <span className="min-w-0 flex-1 truncate" dir="auto">{r.title}</span>
                        <Pill tone={requestStatusMeta[r.status].tone} icon={requestStatusMeta[r.status].icon}>
                          {t(`request.internal.${r.status}`)}
                        </Pill>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
          <aside className="space-y-5">
            <Panel className="px-4 py-3">
              <dl>
                <Meta label={t("project.progress")}>
                  <ProgressBar value={tasks.length ? (done / tasks.length) * 100 : 0} label={t("project.progress")} />
                </Meta>
                <Meta label={t("common.owner")}>{p.ownerName ?? "—"}</Meta>
                <Meta label={t("project.targetDate")}>{p.targetDate ? formatDay(p.targetDate, locale, { year: "numeric" }) : t("common.noDate")}</Meta>
                <Meta label={t("project.access")}>{p.access === "members" ? t("project.accessMembers") : t("project.accessWorkspace")}</Meta>
              </dl>
            </Panel>
            <Panel>
              <PanelHeader title={t("project.members")} />
              <ul className="space-y-2 p-4">
                {p.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={m.name} size={22} /> {m.name}
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="space-y-3">
          <div className="flex justify-end gap-1" role="group" aria-label={t("task.list") + " / " + t("task.board")}>
            <Link href={`${base}?tab=tasks`} aria-current={!board ? "page" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", !board ? "bg-brand-soft font-medium" : "text-fg-2 hover:bg-hover")}>
              <LayoutList className="h-4 w-4" /> {t("task.list")}
            </Link>
            <Link href={`${base}?tab=tasks&view=board`} aria-current={board ? "page" : undefined} className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm", board ? "bg-brand-soft font-medium" : "text-fg-2 hover:bg-hover")}>
              <Columns3 className="h-4 w-4" /> {t("task.board")}
            </Link>
          </div>
          {board ? (
            <Board slug={slug} tasks={tasks} today={today} />
          ) : (
            <Panel>
              <QuickAddTask slug={slug} projectId={id} people={people} />
              <div className="border-t border-line">
                <TaskList slug={slug} tasks={tasks} today={today} showContext={false} empty={<p className="px-4 py-3 text-sm text-muted">{t("task.emptyBody")}</p>} />
              </div>
            </Panel>
          )}
        </div>
      ) : null}

      {tab === "files" ? (
        <Panel className="p-2">
          <FileList files={extras.files.map((f) => ({ id: f.id, filename: f.filename, size: f.size, mime: f.mime, url: signedFileUrl(slug, f.id, actor.user.id) }))} empty={t("common.none")} />
        </Panel>
      ) : null}

      {tab === "activity" ? <Timeline events={extras.events} t={t} locale={locale} timeZone={actor.tenant.timezone} /> : null}
    </div>
  );
}
