import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Info, Lock } from "lucide-react";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { getTask } from "@/server/services/tasks";
import { listStaff } from "@/server/services/people";
import { projectOptions } from "@/server/services/projects";
import { signedFileUrl } from "@/server/services/files";
import { AppError } from "@/server/errors";
import { todayIn } from "@/i18n";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { TaskList } from "@/components/work/task-list";
import { QuickAddTask } from "@/components/work/quick-add";
import { Thread } from "@/components/work/thread";
import { Timeline } from "@/components/work/timeline";
import { FileList, FileUpload } from "@/components/work/files";
import { Dependencies } from "@/components/work/dependencies";
import { TaskProperties, EditableText } from "@/components/work/task-properties";
import { AiAssist } from "@/components/ai/ai-assist";
import { SuggestTasks } from "@/components/ai/suggest-tasks";
import { commentTaskAction, uploadTaskFilesAction } from "../../actions";
import { aiEnabledFor } from "@/server/services/settings";

export default async function TaskPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const actor = await requireStaff(slug);
  const { t, locale } = await getI18n();
  const task = await getTask(actor, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [people, projects, ai] = await Promise.all([listStaff(actor), projectOptions(actor), aiEnabledFor(actor)]);
  const today = todayIn(actor.tenant.timezone);
  const files = task.files.map((f) => ({ id: f.id, filename: f.filename, size: f.size, mime: f.mime, url: signedFileUrl(slug, f.id, actor.user.id) }));
  const comment = commentTaskAction.bind(null, slug, task.id);
  const upload = uploadTaskFilesAction.bind(null, slug, task.id);

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
          {task.projectId ? (
            <Link href={`/w/${slug}/projects/${task.projectId}`} className="hover:text-fg hover:underline">
              {task.projectName}
            </Link>
          ) : (
            <Link href={`/w/${slug}`} className="hover:text-fg hover:underline">
              {t("nav.myWork")}
            </Link>
          )}
          {task.parent ? (
            <>
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              <Link href={`/w/${slug}/tasks/${task.parent.id}`} className="hover:text-fg hover:underline">
                {task.parent.title}
              </Link>
            </>
          ) : null}
          {task.clientName ? <span className="ms-2 rounded bg-neutral-soft px-1.5 py-0.5 text-xs text-fg-2">{task.clientName}</span> : null}
        </nav>

        <header>
          <EditableText slug={slug} taskId={task.id} field="title" value={task.title} placeholder={t("task.titlePlaceholder")} className="-mx-1.5 px-1.5 py-1 text-xl font-semibold text-fg" label={t("common.title")} />
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t("task.internalOnly")}
          </p>
        </header>

        <section aria-labelledby="desc-h">
          <h2 id="desc-h" className="mb-1.5 text-sm font-medium text-muted">
            {t("task.description")}
          </h2>
          <EditableText slug={slug} taskId={task.id} field="description" value={task.description} placeholder={t("task.descriptionPlaceholder")} multiline className="-mx-1.5 min-h-12 px-1.5 py-1.5 leading-relaxed text-fg-2" label={t("task.description")} />
        </section>

        {!task.parentTaskId ? (
          <Panel>
            <PanelHeader
              title={t("task.subtasks")}
              description={task.subtasks.length ? `${task.subtasks.filter((s) => s.status === "done").length}/${task.subtasks.length}` : undefined}
              actions={ai.suggest_tasks ? <SuggestTasks slug={slug} target={{ kind: "task", id: task.id }} people={people} /> : null}
            />
            <TaskList slug={slug} tasks={task.subtasks} today={today} showContext={false} dense />
            <div className={task.subtasks.length ? "border-t border-line" : ""}>
              <QuickAddTask slug={slug} parentTaskId={task.id} people={people} placeholder={t("task.addSubtask")} />
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title={t("task.comments")} description={t("task.internalOnly")} />
          <Thread
            items={task.comments.map((c) => ({ id: c.id, body: c.body, authorName: c.authorName, createdAt: c.createdAt.toISOString() }))}
            mode="internal"
            anchorPrefix="comment"
            placeholder={t("task.commentPlaceholder")}
            submitLabel={t("task.comment")}
            onSubmit={comment}
          />
        </Panel>

        <section aria-labelledby="act-h">
          <h2 id="act-h" className="mb-3 text-sm font-medium text-muted">
            {t("task.activity")}
          </h2>
          <Timeline events={task.events} t={t} locale={locale} timeZone={actor.tenant.timezone} />
        </section>
      </div>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Panel className="px-4 py-3">
          <TaskProperties slug={slug} task={task} people={people} projects={projects} />
          {task.requestRef ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-sm text-muted">{t("task.linkedRequest")}</p>
              <Link href={`/w/${slug}/requests/${task.requestRef}`} className="mt-0.5 block font-medium text-fg hover:underline" dir="auto">
                <span className="tnum text-muted">{task.requestRef}</span> · {task.requestTitle}
              </Link>
              <p className="mt-2 flex gap-1.5 text-xs text-muted">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t("task.doneNotDelivered")}
              </p>
            </div>
          ) : null}
        </Panel>

        {ai.enabled && (ai.summarize || ai.next_steps) ? (
          <section aria-label={t("ai.label")}>
            <AiAssist
              slug={slug}
              target={{ kind: "task", id: task.id }}
              allowNextSteps={ai.next_steps}
              taskParent={{ parentTaskId: task.parentTaskId ? null : task.id, requestId: task.parentTaskId ? task.requestId : null, projectId: task.projectId }}
            />
          </section>
        ) : null}

        <Panel>
          <PanelHeader title={t("task.blockers")} />
          <div className="p-3">
            <Dependencies
              slug={slug}
              deps={task.dependencies.map((d) => ({ ...d, ownerName: d.ownerName }))}
              today={today}
              taskId={task.id}
              requestId={task.requestId}
              people={people}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title={t("task.files")} actions={<FileUpload onUpload={upload} label={t("common.add")} />} />
          <div className="p-2">
            <FileList files={files} empty={t("common.none")} />
          </div>
        </Panel>
      </aside>
    </article>
  );
}
