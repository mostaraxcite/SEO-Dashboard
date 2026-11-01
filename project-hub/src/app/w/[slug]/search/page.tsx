import Link from "next/link";
import { requireStaff } from "@/server/context";
import { getI18n } from "@/server/i18n";
import { search } from "@/server/services/search";
import { PageHeader, Panel, PanelHeader, Ref } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { Pill, requestStatusMeta, taskStatusMeta, projectStatusMeta } from "@/components/ui/status";

export const metadata = { title: "Search" };

export default async function SearchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const actor = await requireStaff(slug);
  const { t } = await getI18n();
  const res = await search(actor, q);
  const total = res.requests.length + res.projects.length + res.tasks.length;
  return (
    <>
      <PageHeader title={t("search.title")} description={t("search.hint")} />
      <form role="search" className="mb-5 max-w-xl">
        <label>
          <span className="sr-only">{t("common.search")}</span>
          <Input name="q" type="search" defaultValue={q} placeholder={t("search.placeholder")} autoFocus dir="auto" />
        </label>
      </form>
      {q && total === 0 ? <p className="text-fg-2">{t("search.noResults", { q })}</p> : null}
      <div className="space-y-5">
        {res.requests.length ? (
          <Panel>
            <PanelHeader title={t("request.requests")} />
            <ul className="divide-y divide-line">
              {res.requests.map((r) => (
                <li key={r.ref}>
                  <Link href={`/w/${slug}/requests/${r.ref}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                    <Ref>{r.ref}</Ref>
                    <span className="min-w-0 flex-1 truncate" dir="auto">{r.title}</span>
                    <Pill tone={requestStatusMeta[r.status].tone} icon={requestStatusMeta[r.status].icon}>{t(`request.internal.${r.status}`)}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        {res.projects.length ? (
          <Panel>
            <PanelHeader title={t("project.projects")} />
            <ul className="divide-y divide-line">
              {res.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/w/${slug}/projects/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                    <span className="min-w-0 flex-1 truncate" dir="auto">{p.name}</span>
                    <Pill tone={projectStatusMeta[p.status].tone} icon={projectStatusMeta[p.status].icon}>{t(`project.status.${p.status}`)}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
        {res.tasks.length ? (
          <Panel>
            <PanelHeader title={t("task.tasks")} />
            <ul className="divide-y divide-line">
              {res.tasks.map((x) => (
                <li key={x.id}>
                  <Link href={`/w/${slug}/tasks/${x.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-hover/60">
                    <span className="min-w-0 flex-1 truncate" dir="auto">{x.title}</span>
                    <Pill tone={taskStatusMeta[x.status].tone} icon={taskStatusMeta[x.status].icon}>{t(`task.status.${x.status}`)}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
